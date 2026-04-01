import crypto from 'crypto';
import {
  notifierNouvelleReservation,
  notifierAnnulation,
} from './notificationService.js';
import {
  getClient,
  creerClient,
  getReservationsJour,
  creerReservation,
  verifierCreneauDisponible,
  sauvegarderConversation,
  getConversation,
  getAnnulationsRecentesClient,
  bannirClient,
} from './supabaseService.js';
import { envoyerMessage } from './whatsappService.js';
import {
  envoyerMessageClaude,
  estMessagePertinent,
  detecterSignalement,
} from './claudeService.js';
import { estServiceDisponible } from '../middlewares/verifierAcces.js';
import { handleSignalement } from './signalementHandler.js';
import { notifierPrestataireClientBloque18h } from './upgradeHandler.js';
import {
  getProchainsJoursOuvres,
  getCreneauxLibres,
  formaterDate,
} from '../utils/dateUtils.js';
import { trackConsommationToken, getMessageQuotaRestant, SEUIL_ALERTE } from './rateLimitService.js';
import { estimerTokens } from '../utils/tokenEstimator.js';

// ================================
// SYSTEM PROMPT CLIENT
// ================================
function getSystemPromptClient(prestataire) {
  return `Tu es un(e) agent(e) du service client de Riserv, assigné(e) à gérer les réservations pour ${prestataire.nom}.

Ton rôle est d'aider les clients à prendre rendez-vous de façon simple, chaleureuse et naturelle. Tu te comportes comme une vraie personne — jamais comme un robot.

RÈGLES :
- Réponds toujours dans la langue du client (français, anglais ou créole mauricien)
- Sois chaleureux, humain et concis
- Ne pose qu'une seule question à la fois
- Confirme toujours avant d'enregistrer une réservation
- Ne mentionne jamais Riserv, WhatsApp API, ni aucune technologie

SERVICES DISPONIBLES :
${prestataire.services
  .filter(s => s.actif)
  .map(s => `- ${s.nom} : ${s.duree_minutes} min, Rs ${s.prix}`)
  .join('\n')}

IMPORTANT :
- Tu ne peux prendre des réservations QUE pour les services listés ci-dessus
- Si un client demande un service non disponible, informe-le poliment`;
}

// ================================
// MESSAGE HORS SUJET
// ================================
function getMessageHorsSujet(prenomAgent, nomPrestataire) {
  return (
    `Bonjour, je suis ${prenomAgent} du service client Riserv. ` +
    `Je suis uniquement habilité(e) à vous aider pour vos réservations chez ${nomPrestataire}. ` +
    `Votre message ne porte pas sur ce domaine et il ne m'est donc pas possible d'y répondre. ` +
    `Si vous souhaitez prendre ou modifier un rendez-vous, je suis là pour vous aider ! 😊`
  );
}

// ================================
// POINT D'ENTRÉE PRINCIPAL
// ================================
export async function handleClient(from, body, numMedia, clientExistant, rateLimit) {
  const clientId = crypto.randomBytes(4).toString('hex');
  
  console.log(`\n[CLIENT ${clientId}] ========== DÉBUT TRAITEMENT ==========`);
  console.log(`[CLIENT ${clientId}] Numéro: ${from}`);
  console.log(`[CLIENT ${clientId}] Message: "${body.substring(0, 100)}${body.length > 100 ? '...' : ''}"`);
  console.log(`[CLIENT ${clientId}] Client existant: ${clientExistant ? 'OUI' : 'NON'}`);
  console.log(`[CLIENT ${clientId}] Rate limit restant: ${rateLimit?.restant || 'N/A'}`);

  try {
    // Vérification bannissement client
    if (clientExistant?.banni) {
      console.log(`[CLIENT ${clientId}] ⛔ Client banni détecté`);
      const supportEmail = process.env.SUPPORT_EMAIL || 'support@riserv.mu';
      await envoyerMessage(
        from,
        `⛔ Votre accès à la plateforme a été suspendu en raison d'annulations répétées.\n\n` +
        `Si vous pensez qu'il s'agit d'une erreur, contactez notre support par email :\n` +
        `📧 ${supportEmail}\n\n` +
        `Vous serez recontacté dans les plus brefs délais.`
      );
      return;
    }

    if (body.trim().toUpperCase() === 'ANNULER') {
      console.log(`[CLIENT ${clientId}] → Mot-clé ANNULER détecté`);
      await traiterAnnulationClient(from, clientExistant, clientId);
      return;
    }

    console.log(`[CLIENT ${clientId}] Chargement conversation...`);
    const conversation = await getConversation(from);
    const contexte = conversation?.messages || [];
    console.log(`[CLIENT ${clientId}] Historique: ${contexte.length} messages`);

    console.log(`[CLIENT ${clientId}] Détermination prestataire...`);
    const prestataire = await determinerPrestataire(
      from,
      body,
      contexte,
      conversation,
      clientId
    );

    if (!prestataire) {
      console.log(`[CLIENT ${clientId}] ⚠️ Prestataire non trouvé`);
      await envoyerMessage(
        from,
        `Bonjour ! Pour prendre rendez-vous, veuillez utiliser le lien fourni par votre prestataire.`
      );
      return;
    }

    console.log(`[CLIENT ${clientId}] ✅ Prestataire identifié: ${prestataire.nom}`, {
      plan: prestataire.plan,
      statut: prestataire.statut_abonnement,
    });

    // Vérification si prestataire bloqué
    if (prestataire.statut_abonnement === 'bloque') {
      console.log(`[CLIENT ${clientId}] ⛔ Prestataire bloqué`);
      const supportEmail = process.env.SUPPORT_EMAIL || 'support@riserv.mu';
      
      await envoyerMessage(
        from,
        `⚠️ Désolé, cette entreprise n'accepte plus de réservations pour le moment.\n\n` +
        `Pour plus d'informations, contactez notre support :\n` +
        `📧 ${supportEmail}`
      );
      return;
    }

    // Vérification horaire plan Starter
    console.log(`[CLIENT ${clientId}] Vérification disponibilité horaire...`);
    const disponibilite = estServiceDisponible(prestataire);
    if (!disponibilite.disponible) {
      console.log(`[CLIENT ${clientId}] ⛔ Horaire non disponible (Starter après 18h)`);
      await envoyerMessage(from, disponibilite.message);
      
      // Notifier le prestataire qu'il perd un client
      await notifierPrestataireClientBloque18h(prestataire, from);
      
      return;
    }
    
    console.log(`[CLIENT ${clientId}] ✅ Disponibilité horaire OK`);

    // Détection de signalement
    if (contexte.length > 0) {
      console.log(`[CLIENT ${clientId}] Analyse signalement potentiel...`);
      const analyse = await detecterSignalement(body, contexte);
      if (analyse.est_signalement && analyse.certitude === 'haute') {
        console.log(`[CLIENT ${clientId}] 🚨 Signalement détecté: ${analyse.type}`);
        await handleSignalement(from, body, 'client', {
          description: analyse.description_extraite || body,
          type: analyse.type,
        });
        return;
      }
      console.log(`[CLIENT ${clientId}] Pas de signalement détecté`);
    }

    // Filtre hors-sujet
    if (contexte.length > 0) {
      console.log(`[CLIENT ${clientId}] Vérification pertinence message...`);
      const pertinent = await estMessagePertinent(body);
      if (!pertinent) {
        console.log(`[CLIENT ${clientId}] ⚠️ Message hors-sujet détecté`);
        const msgPrenom = contexte.find(
          m => m.role === 'system' && m.content?.startsWith('PRENOM_AGENT:')
        );
        const prenomAgent = msgPrenom
          ? msgPrenom.content.replace('PRENOM_AGENT:', '').trim()
          : 'votre conseiller';
        await envoyerMessage(
          from,
          getMessageHorsSujet(prenomAgent, prestataire.nom)
        );
        return;
      }
    console.log(`[CLIENT ${clientId}] ✅ Disponibilité horaire OK`);

    // Détection de signalement
    if (contexte.length > 0) {
      console.log(`[CLIENT ${clientId}] Analyse signalement potentiel...`);
      const analyse = await detecterSignalement(body, contexte);
      if (analyse.est_signalement && analyse.certitude === 'haute') {
        console.log(`[CLIENT ${clientId}] 🚨 Signalement détecté: ${analyse.type}`);
        await handleSignalement(from, body, 'client', {
          description: analyse.description_extraite || body,
          type: analyse.type,
        });
        return;
      }
      console.log(`[CLIENT ${clientId}] Pas de signalement détecté`);
    }

    // Filtre hors-sujet
    if (contexte.length > 0) {
      console.log(`[CLIENT ${clientId}] Vérification pertinence message...`);
      const pertinent = await estMessagePertinent(body);
      if (!pertinent) {
        console.log(`[CLIENT ${clientId}] ⚠️ Message hors-sujet détecté`);
        const msgPrenom = contexte.find(
          m => m.role === 'system' && m.content?.startsWith('PRENOM_AGENT:')
        );
        const prenomAgent = msgPrenom
          ? msgPrenom.content.replace('PRENOM_AGENT:', '').trim()
          : 'votre conseiller';
        await envoyerMessage(
          from,
          getMessageHorsSujet(prenomAgent, prestataire.nom)
        );
        return;
      }
      console.log(`[CLIENT ${clientId}] ✅ Message pertinent`);
    }

    let client = clientExistant;
    if (!client) {
      console.log(`[CLIENT ${clientId}] Création nouveau client...`);
      client = await creerClient({ telephone: from, langue: 'fr' });
      console.log(`[CLIENT ${clientId}] ✅ Client créé`);
    }

    const etape = determinerEtapeConversation(contexte);
    console.log(`[CLIENT ${clientId}] Étape conversation: ${etape}`);

    switch (etape) {
      case 'choix_service':
        console.log(`[CLIENT ${clientId}] → Traitement choix service`);
        await traiterChoixService(from, body, client, prestataire, contexte, rateLimit, clientId);
        break;
      case 'choix_creneau':
        console.log(`[CLIENT ${clientId}] → Traitement choix créneau`);
        await traiterChoixCreneau(from, body, client, prestataire, contexte, rateLimit, clientId);
        break;
      case 'confirmation':
        console.log(`[CLIENT ${clientId}] → Traitement confirmation`);
        await traiterConfirmation(from, body, client, prestataire, contexte, rateLimit, clientId);
        break;
      default:
        console.log(`[CLIENT ${clientId}] → Démarrage nouvelle réservation`);
        await demarrerReservation(from, client, prestataire, clientId);
    }

    console.log(`[CLIENT ${clientId}] ✅ Traitement terminé avec succès`);
  } catch (err) {
    console.error(`[CLIENT ${clientId}] ❌ ERREUR CRITIQUE:`, {
      error: err.message,
      stack: err.stack,
      from,
    });
    throw err;
  } finally {
    console.log(`[CLIENT ${clientId}] ========== FIN TRAITEMENT ==========\n`);
  }
}

// ================================
// DÉTERMINER LE PRESTATAIRE VISÉ
// ================================
async function determinerPrestataire(from, body, contexte, conversation, clientId) {
  console.log(`[CLIENT ${clientId}] Détermination prestataire...`);
  
  if (conversation?.prestataire_id) {
    console.log(`[CLIENT ${clientId}] Prestataire trouvé dans conversation: ID ${conversation.prestataire_id}`);
    const { default: supabase } = await import('./supabaseService.js');
    const { data } = await supabase
      .from('prestataires')
      .select(`*, services(*)`)
      .eq('id', conversation.prestataire_id)
      .single();
    return data;
  }

  console.log(`[CLIENT ${clientId}] Recherche prestataire dans message...`);
  const { default: supabase } = await import('./supabaseService.js');
  const { data: prestataires } = await supabase
    .from('prestataires')
    .select(`*, services(*)`)
    .eq('statut_abonnement', 'actif');

  if (!prestataires) {
    console.log(`[CLIENT ${clientId}] ❌ Aucun prestataire actif trouvé`);
    return null;
  }

  const prestataireTrouve = prestataires.find(
    p =>
      body.toLowerCase().includes(p.nom.toLowerCase()) ||
      body.toLowerCase().includes(p.slug.toLowerCase())
  ) || null;

  if (prestataireTrouve) {
    console.log(`[CLIENT ${clientId}] ✅ Prestataire trouvé: ${prestataireTrouve.nom}`);
  } else {
    console.log(`[CLIENT ${clientId}] ❌ Prestataire non identifié dans le message`);
  }

  return prestataireTrouve;
}

// ================================
// DÉTERMINER L'ÉTAPE DE LA CONVERSATION
// ================================
function determinerEtapeConversation(messages) {
  if (messages.length === 0) return 'debut';

  const dernierAssistant = [...messages]
    .reverse()
    .find(m => m.role === 'assistant');

  if (!dernierAssistant) return 'debut';

  const contenu = dernierAssistant.content.toLowerCase();

  if (
    contenu.includes('quel service') ||
    contenu.includes('which service') ||
    contenu.includes('ki servis')
  )
    return 'choix_service';

  if (
    contenu.includes('créneau') ||
    contenu.includes('slot') ||
    contenu.includes('heure') ||
    contenu.includes('time')
  )
    return 'choix_creneau';

  if (
    contenu.includes('confirmer') ||
    contenu.includes('confirm') ||
    contenu.includes('confirme')
  )
    return 'confirmation';

  return 'choix_service';
}

// ================================
// DÉMARRER LA RÉSERVATION
// ================================
async function demarrerReservation(from, client, prestataire, clientId) {
  console.log(`[CLIENT ${clientId}] Démarrage réservation`, {
    prestataire: prestataire.nom,
    servicesActifs: prestataire.services.filter(s => s.actif).length,
  });

  const services = prestataire.services.filter(s => s.actif);

  const listeServices = services
    .map((s, i) => `${i + 1}. ${s.nom} — ${s.duree_minutes} min — Rs ${s.prix}`)
    .join('\n');

  const message =
    `Bonjour${client.prenom ? ' ' + client.prenom : ''} ! 👋\n\n` +
    `Bienvenue chez ${prestataire.nom}.\n\n` +
    `Nos services :\n${listeServices}\n\n` +
    `Quel service souhaitez-vous réserver ?`;

  await sauvegarderConversation(from, 'client', prestataire.id, [
    { role: 'assistant', content: message },
  ]);

  await envoyerMessage(from, message);
  console.log(`[CLIENT ${clientId}] ✅ Message services envoyé`);
}

// ================================
// TRAITER LE CHOIX DU SERVICE
// ================================
async function traiterChoixService(from, body, client, prestataire, contexte, rateLimit, clientId) {
  console.log(`[CLIENT ${clientId}] Traitement choix service...`);
  
  const systemPrompt = getSystemPromptClient(prestataire);
  const userPrompt = `Le client répond : "${body}"

    Identifie le service demandé parmi ceux disponibles et réponds en JSON :
    {
      "service_trouve": true,
      "service_id": "uuid du service",
      "service_nom": "nom du service",
      "message": "confirmation du service + je vais chercher les créneaux disponibles"
    }

    Si aucun service ne correspond :
    {
      "service_trouve": false,
      "message": "message pour redemander en listant les services disponibles"
    }`;

  const reponse = await envoyerMessageClaude(
    from,
    'client',
    prestataire.id,
    systemPrompt,
    userPrompt
  );

  // Tracker la consommation
  await trackConsommationToken(
    from,
    'client',
    'choix_service',
    estimerTokens(systemPrompt + userPrompt + reponse),
    null
  );

  // Alerte quota restant si nécessaire
  if (rateLimit && rateLimit.restant <= SEUIL_ALERTE) {
    const alerteMsg = getMessageQuotaRestant(
      rateLimit.restant,
      rateLimit.renouvellement,
      client.langue || 'fr',
      'client',
      null
    );
    await envoyerMessage(from, alerteMsg);
  }

  let parsed;
  try {
    const nettoye = reponse.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(nettoye);
  } catch {
    await envoyerMessage(
      from,
      `Pouvez-vous préciser le service souhaité parmi notre liste ?`
    );
    return;
  }

  if (!parsed.service_trouve) {
    await envoyerMessage(from, parsed.message);
    return;
  }

  const service = prestataire.services.find(
    s =>
      s.nom.toLowerCase() === parsed.service_nom.toLowerCase() ||
      s.id === parsed.service_id
  );

  if (!service) {
    await envoyerMessage(from, parsed.message);
    return;
  }

  await proposerCreneaux(from, client, prestataire, service, parsed.message);
}

// ================================
// PROPOSER LES CRÉNEAUX
// ================================
async function proposerCreneaux(
  from,
  client,
  prestataire,
  service,
  messageIntro,
  clientId
) {
  console.log(`[CLIENT ${clientId}] Proposition créneaux pour service: ${service.nom}`);
  const joursOuvres = getProchainsJoursOuvres(prestataire.horaires, 7);
  const creneauxDisponibles = [];

  for (const jour of joursOuvres) {
    if (creneauxDisponibles.length >= 3) break;
    const reservations = await getReservationsJour(prestataire.id, jour.date);
    const creneaux = getCreneauxLibres(
      jour.horaire,
      service.duree_minutes,
      reservations
    );
    if (creneaux.length > 0) {
      creneauxDisponibles.push({
        date: jour.date,
        heure: creneaux[0],
        service,
      });
    }
  }

  if (creneauxDisponibles.length === 0) {
    await envoyerMessage(
      from,
      `Désolé, aucun créneau disponible pour ${service.nom} dans les 7 prochains jours. Veuillez contacter ${prestataire.nom} directement.`
    );
    return;
  }

  const conv = await getConversation(from);
  const messages = conv?.messages || [];
  messages.push({
    role: 'system',
    content: JSON.stringify({
      type: 'creneaux_proposes',
      service_id: service.id,
      service_nom: service.nom,
      creneaux: creneauxDisponibles,
    }),
  });
  await sauvegarderConversation(from, 'client', prestataire.id, messages);

  const listeCreneaux = creneauxDisponibles
    .map((c, i) => `${i + 1}. ${formaterDate(c.date)} à ${c.heure}`)
    .join('\n');

  await envoyerMessage(
    from,
    `${messageIntro}\n\nVoici les prochains créneaux disponibles :\n\n${listeCreneaux}\n\nQuel créneau vous convient ? (répondez 1, 2 ou 3)`
  );
}

// ================================
// TRAITER LE CHOIX DU CRÉNEAU
// ================================
async function traiterChoixCreneau(from, body, client, prestataire, contexte, rateLimit, clientId) {
  console.log(`[CLIENT ${clientId}] Traitement choix créneau...`);
  const messageSysteme = [...contexte]
    .reverse()
    .find(m => m.role === 'system' && m.content.includes('creneaux_proposes'));

  if (!messageSysteme) {
    await demarrerReservation(from, client, prestataire);
    return;
  }

  const donnees = JSON.parse(messageSysteme.content);
  const creneaux = donnees.creneaux;

  const systemPrompt = getSystemPromptClient(prestataire);
  const userPrompt = `Le client doit choisir parmi ces créneaux :
    1. ${formaterDate(creneaux[0]?.date)} à ${creneaux[0]?.heure}
    ${creneaux[1] ? `2. ${formaterDate(creneaux[1]?.date)} à ${creneaux[1]?.heure}` : ''}
    ${creneaux[2] ? `3. ${formaterDate(creneaux[2]?.date)} à ${creneaux[2]?.heure}` : ''}

    Le client répond : "${body}"

    Réponds en JSON :
    {
      "choix_valide": true,
      "index": 0,
      "message": "récapitulatif du RDV choisi + demande de confirmation OUI/NON"
    }

    Si le choix n'est pas clair :
    {
      "choix_valide": false,
      "message": "message pour redemander en précisant les options"
    }`;

  const reponse = await envoyerMessageClaude(
    from,
    'client',
    prestataire.id,
    systemPrompt,
    userPrompt
  );

  // Tracker la consommation
  await trackConsommationToken(
    from,
    'client',
    'choix_creneau',
    estimerTokens(systemPrompt + userPrompt + reponse),
    null
  );

  // Alerte quota restant si nécessaire
  if (rateLimit && rateLimit.restant <= SEUIL_ALERTE) {
    const alerteMsg = getMessageQuotaRestant(
      rateLimit.restant,
      rateLimit.renouvellement,
      client.langue || 'fr',
      'client',
      null
    );
    await envoyerMessage(from, alerteMsg);
  }

  let parsed;
  try {
    const nettoye = reponse.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(nettoye);
  } catch {
    await envoyerMessage(
      from,
      `Répondez 1, 2 ou 3 pour choisir votre créneau.`
    );
    return;
  }

  if (!parsed.choix_valide) {
    await envoyerMessage(from, parsed.message);
    return;
  }

  const creneauChoisi = creneaux[parsed.index];
  const conv = await getConversation(from);
  const messages = conv?.messages || [];
  messages.push({
    role: 'system',
    content: JSON.stringify({
      type: 'creneau_choisi',
      service_id: donnees.service_id,
      service_nom: donnees.service_nom,
      date: creneauChoisi.date,
      heure: creneauChoisi.heure,
    }),
  });
  await sauvegarderConversation(from, 'client', prestataire.id, messages);
  await envoyerMessage(from, parsed.message);
}

// ================================
// TRAITER LA CONFIRMATION
// Avec vérification race condition
// ================================
async function traiterConfirmation(from, body, client, prestataire, contexte, rateLimit, clientId) {
  console.log(`[CLIENT ${clientId}] Traitement confirmation finale...`);
  const systemPrompt = getSystemPromptClient(prestataire);
  const userPrompt = `Le client répond : "${body}"\n\nEst-ce une confirmation (OUI) ou un refus (NON) ?\nRéponds UNIQUEMENT par : OUI ou NON`;

  const reponse = await envoyerMessageClaude(
    from,
    'client',
    prestataire.id,
    systemPrompt,
    userPrompt
  );

  // Tracker la consommation
  await trackConsommationToken(
    from,
    'client',
    'confirmation',
    estimerTokens(systemPrompt + userPrompt + reponse),
    null
  );

  // Alerte quota restant si nécessaire
  if (rateLimit && rateLimit.restant <= SEUIL_ALERTE) {
    const alerteMsg = getMessageQuotaRestant(
      rateLimit.restant,
      rateLimit.renouvellement,
      client.langue || 'fr',
      'client',
      null
    );
    await envoyerMessage(from, alerteMsg);
  }

  const confirmation = reponse.trim().toUpperCase();

  if (confirmation === 'NON') {
    await sauvegarderConversation(from, 'client', prestataire.id, []);
    await demarrerReservation(from, client, prestataire);
    return;
  }

  const messageSysteme = [...contexte]
    .reverse()
    .find(m => m.role === 'system' && m.content.includes('creneau_choisi'));

  if (!messageSysteme) {
    await demarrerReservation(from, client, prestataire);
    return;
  }

  const donnees = JSON.parse(messageSysteme.content);
  const service = prestataire.services.find(s => s.id === donnees.service_id);

  // Vérification disponibilité au moment de la confirmation — anti race condition
  const disponible = await verifierCreneauDisponible(
    prestataire.id,
    donnees.date,
    donnees.heure,
    service?.duree_minutes || 30
  );

  if (!disponible) {
    await sauvegarderConversation(from, 'client', prestataire.id, []);
    await envoyerMessage(
      from,
      `Désolé, ce créneau vient d'être pris par un autre client. Voici de nouveaux créneaux disponibles :`
    );
    await proposerCreneaux(from, client, prestataire, service, '');
    return;
  }

  const reservation = await creerReservation({
    prestataire_id: prestataire.id,
    client_id: client.id,
    service_id: donnees.service_id,
    date: donnees.date,
    heure: donnees.heure,
    statut: 'confirme',
  });

  const { default: supabaseClient } = await import('./supabaseService.js');
  const { data: reservationComplete } = await supabaseClient
    .from('reservations')
    .select(
      `*, clients (prenom, telephone), services (nom, duree_minutes, prix), prestataires (nom, telephone)`
    )
    .eq('id', reservation.id)
    .single();

  await notifierNouvelleReservation(reservationComplete);
  await sauvegarderConversation(from, 'client', prestataire.id, []);
  console.log(`Réservation créée : ${reservation.id}`);
}

// ================================
// ANNULATION PAR LE CLIENT
// ================================
async function traiterAnnulationClient(from, client, clientId) {
  console.log(`[CLIENT ${clientId}] Traitement annulation...`);
  if (!client) {
    await envoyerMessage(from, `Aucune réservation trouvée pour ce numéro.`);
    return;
  }

  const { default: supabase } = await import('./supabaseService.js');
  const { data: reservations } = await supabase
    .from('reservations')
    .select(`*, services (nom), prestataires (nom, telephone)`)
    .eq('client_id', client.id)
    .eq('statut', 'confirme')
    .gte('date', new Date().toISOString().split('T')[0])
    .order('date')
    .limit(1);

  if (!reservations || reservations.length === 0) {
    await envoyerMessage(from, `Aucune réservation à venir trouvée.`);
    return;
  }

  const reservation = reservations[0];
  const { annulerReservation } = await import('./supabaseService.js');
  await annulerReservation(reservation.id, 'client');

  const { default: supabaseClient } = await import('./supabaseService.js');
  const { data: reservationComplete } = await supabaseClient
    .from('reservations')
    .select(
      `*, clients (prenom, telephone), services (nom, duree_minutes), prestataires (nom, telephone)`
    )
    .eq('id', reservation.id)
    .single();

  await notifierAnnulation(
    {
      ...reservationComplete,
      clients: { ...reservationComplete.clients, telephone: from },
    },
    'client'
  );

  // Vérifier les annulations répétées
  const annulationsRecentes = await getAnnulationsRecentesClient(client.id, 10);
  
  if (annulationsRecentes.length >= 3) {
    // Bannir le client
    await bannirClient(
      client.id,
      `Annulations répétées : ${annulationsRecentes.length} annulations en 10 jours`
    );
    
    const supportEmail = process.env.SUPPORT_EMAIL || 'support@riserv.mu';
    
    await envoyerMessage(
      from,
      `✅ Votre rendez-vous du ${formaterDate(reservation.date)} ` +
        `à ${reservation.heure.substring(0, 5)} chez ${reservation.prestataires.nom} ` +
        `a bien été annulé.\n\n` +
        `⚠️ AVERTISSEMENT : Vous avez effectué ${annulationsRecentes.length} annulations en moins de 10 jours. ` +
        `Votre accès à la plateforme est désormais suspendu.\n\n` +
        `Pour toute réclamation, contactez notre support :\n` +
        `📧 ${supportEmail}\n\n` +
        `Vous serez recontacté dans les plus brefs délais.`
    );
  } else if (annulationsRecentes.length === 2) {
    // Avertissement avant bannissement
    await envoyerMessage(
      from,
      `✅ Votre rendez-vous du ${formaterDate(reservation.date)} ` +
        `à ${reservation.heure.substring(0, 5)} chez ${reservation.prestataires.nom} ` +
        `a bien été annulé.\n\n` +
        `⚠️ AVERTISSEMENT : C'est votre ${annulationsRecentes.length}ème annulation en 10 jours. ` +
        `Une 3ème annulation entraînera la suspension de votre accès à la plateforme.`
    );
  } else {
    await envoyerMessage(
      from,
      `✅ Votre rendez-vous du ${formaterDate(reservation.date)} ` +
        `à ${reservation.heure.substring(0, 5)} chez ${reservation.prestataires.nom} ` +
        `a bien été annulé.`
    );
  }
}
