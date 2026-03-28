import {
  getClient,
  creerClient,
  getServicesPrestataire,
  getReservationsJour,
  creerReservation,
  getPrestataireParSlug,
  sauvegarderConversation,
  getConversation,
} from './supabaseService.js';
import { envoyerMessage } from './whatsappService.js';
import { envoyerMessageClaude } from './claudeService.js';
import {
  getProchainsJoursOuvres,
  getCreneauxLibres,
  formaterDate,
} from '../utils/dateUtils.js';

// ================================
// SYSTEM PROMPT CLIENT
// ================================
function getSystemPromptClient(prestataire) {
  return `Tu es l'assistant de réservation de ${prestataire.nom}.
  
Ton rôle est d'aider les clients à prendre rendez-vous de façon simple et agréable.

RÈGLES :
- Réponds toujours dans la langue du client (français, anglais ou créole mauricien)
- Sois chaleureux, professionnel et concis
- Ne pose qu'une seule question à la fois
- Confirme toujours avant d'enregistrer une réservation
- Signe toujours tes messages en tant qu'assistant de ${prestataire.nom}, jamais en tant que Riserv

SERVICES DISPONIBLES :
${prestataire.services
  .filter(s => s.actif)
  .map(s => `- ${s.nom} : ${s.duree_minutes} min, Rs ${s.prix}`)
  .join('\n')}

IMPORTANT : 
- Tu ne peux prendre des réservations QUE pour les services listés ci-dessus
- Si un client demande un service non disponible, informe-le poliment
- Ne donne jamais d'informations sur la technologie utilisée (Riserv, WhatsApp API, etc.)`;
}

// ================================
// POINT D'ENTRÉE PRINCIPAL
// ================================
export async function handleClient(from, body, numMedia, clientExistant) {
  // Détecter si le client répond ANNULER à un rappel
  if (body.trim().toUpperCase() === 'ANNULER') {
    await traiterAnnulationClient(from, clientExistant);
    return;
  }

  // Récupérer la conversation en cours pour avoir le contexte
  const conversation = await getConversation(from);
  const contexte = conversation?.messages || [];

  // Déterminer le prestataire visé
  const prestataire = await determinerPrestataire(
    from,
    body,
    contexte,
    conversation
  );

  if (!prestataire) {
    await envoyerMessage(
      from,
      `Bonjour ! Pour prendre rendez-vous, veuillez utiliser ` +
        `le lien fourni par votre prestataire.`
    );
    return;
  }

  // Créer le client s'il n'existe pas encore
  let client = clientExistant;
  if (!client) {
    client = await creerClient({
      telephone: from,
      langue: 'fr',
    });
  }

  // Déterminer l'étape courante de la conversation
  const etape = determinerEtapeConversation(contexte);

  switch (etape) {
    case 'choix_service':
      await traiterChoixService(from, body, client, prestataire, contexte);
      break;
    case 'choix_creneau':
      await traiterChoixCreneau(from, body, client, prestataire, contexte);
      break;
    case 'confirmation':
      await traiterConfirmation(from, body, client, prestataire, contexte);
      break;
    default:
      await demarrerReservation(from, client, prestataire);
  }
}

// ================================
// DÉTERMINER LE PRESTATAIRE VISÉ
// ================================
async function determinerPrestataire(from, body, contexte, conversation) {
  // Si la conversation a déjà un prestataire associé
  if (conversation?.prestataire_id) {
    const { default: supabase } = await import('./supabaseService.js');
    const { data } = await supabase
      .from('prestataires')
      .select(`*, services(*)`)
      .eq('id', conversation.prestataire_id)
      .single();
    return data;
  }

  // Chercher le nom du prestataire dans le message
  // Le lien wa.me envoie le nom du prestataire comme premier message
  const { default: supabase } = await import('./supabaseService.js');
  const { data: prestataires } = await supabase
    .from('prestataires')
    .select(`*, services(*)`)
    .eq('statut_abonnement', 'actif');

  if (!prestataires) return null;

  // Chercher le prestataire dont le nom correspond au message
  const prestataireVise = prestataires.find(
    p =>
      body.toLowerCase().includes(p.nom.toLowerCase()) ||
      body.toLowerCase().includes(p.slug.toLowerCase())
  );

  return prestataireVise || null;
}

// ================================
// DÉTERMINER L'ÉTAPE DE LA CONVERSATION
// ================================
function determinerEtapeConversation(messages) {
  if (messages.length === 0) return 'debut';

  // Analyser les derniers messages pour déterminer où on en est
  const dernierAssistant = [...messages]
    .reverse()
    .find(m => m.role === 'assistant');

  if (!dernierAssistant) return 'debut';

  const contenu = dernierAssistant.content.toLowerCase();

  if (
    contenu.includes('quel service') ||
    contenu.includes('which service') ||
    contenu.includes('ki servis')
  ) {
    return 'choix_service';
  }

  if (
    contenu.includes('créneau') ||
    contenu.includes('slot') ||
    contenu.includes('heure') ||
    contenu.includes('time')
  ) {
    return 'choix_creneau';
  }

  if (
    contenu.includes('confirmer') ||
    contenu.includes('confirm') ||
    contenu.includes('confirme')
  ) {
    return 'confirmation';
  }

  return 'choix_service';
}

// ================================
// DÉMARRER LA RÉSERVATION
// ================================
async function demarrerReservation(from, client, prestataire) {
  const services = prestataire.services.filter(s => s.actif);

  const listeServices = services
    .map((s, i) => `${i + 1}. ${s.nom} — ${s.duree_minutes} min — Rs ${s.prix}`)
    .join('\n');

  const message =
    `Bonjour${client.prenom ? ' ' + client.prenom : ''} ! 👋\n\n` +
    `Bienvenue chez ${prestataire.nom}.\n\n` +
    `Nos services :\n${listeServices}\n\n` +
    `Quel service souhaitez-vous réserver ?`;

  // Sauvegarder ce premier message dans la conversation
  await sauvegarderConversation(from, 'client', prestataire.id, [
    { role: 'assistant', content: message },
  ]);

  await envoyerMessage(from, message);
}

// ================================
// TRAITER LE CHOIX DU SERVICE
// ================================
async function traiterChoixService(from, body, client, prestataire, contexte) {
  const reponse = await envoyerMessageClaude(
    from,
    'client',
    prestataire.id,
    getSystemPromptClient(prestataire),
    `Le client répond : "${body}"
    
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
    }`
  );

  let parsed;
  try {
    // Claude peut parfois entourer le JSON de backticks — on nettoie
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

  // Trouver le service dans la liste du prestataire
  const service = prestataire.services.find(
    s =>
      s.nom.toLowerCase() === parsed.service_nom.toLowerCase() ||
      s.id === parsed.service_id
  );

  if (!service) {
    await envoyerMessage(from, parsed.message);
    return;
  }

  // Chercher les créneaux disponibles
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
  messageIntro
) {
  const joursOuvres = getProchainsJoursOuvres(prestataire.horaires, 7);
  const creneauxDisponibles = [];

  // Chercher des créneaux sur les 7 prochains jours ouverts
  for (const jour of joursOuvres) {
    if (creneauxDisponibles.length >= 3) break;

    const reservations = await getReservationsJour(prestataire.id, jour.date);
    const creneaux = getCreneauxLibres(
      jour.horaire,
      service.duree_minutes,
      reservations
    );

    // Prendre le premier créneau disponible de la journée
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
      `Désolé, aucun créneau disponible pour ${service.nom} ` +
        `dans les 7 prochains jours. Veuillez contacter ${prestataire.nom} directement.`
    );
    return;
  }

  // Sauvegarder les créneaux proposés dans la conversation
  // pour pouvoir les retrouver quand le client choisit
  const conversation = await getConversation(from);
  const messages = conversation?.messages || [];
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

  // Formater le message
  const listeCreneaux = creneauxDisponibles
    .map((c, i) => `${i + 1}. ${formaterDate(c.date)} à ${c.heure}`)
    .join('\n');

  const message =
    `${messageIntro}\n\n` +
    `Voici les prochains créneaux disponibles :\n\n` +
    `${listeCreneaux}\n\n` +
    `Quel créneau vous convient ? (répondez 1, 2 ou 3)`;

  await envoyerMessage(from, message);
}

// ================================
// TRAITER LE CHOIX DU CRÉNEAU
// ================================
async function traiterChoixCreneau(from, body, client, prestataire, contexte) {
  // Récupérer les créneaux proposés depuis la conversation
  const messageSysteme = [...contexte]
    .reverse()
    .find(m => m.role === 'system' && m.content.includes('creneaux_proposes'));

  if (!messageSysteme) {
    await demarrerReservation(from, client, prestataire);
    return;
  }

  const donnees = JSON.parse(messageSysteme.content);
  const creneaux = donnees.creneaux;

  // Déterminer quel créneau le client a choisi
  const reponse = await envoyerMessageClaude(
    from,
    'client',
    prestataire.id,
    getSystemPromptClient(prestataire),
    `Le client doit choisir parmi ces créneaux :
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
    }`
  );

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

  // Sauvegarder le créneau choisi dans la conversation
  const conversation = await getConversation(from);
  const messages = conversation?.messages || [];
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
// ================================
async function traiterConfirmation(from, body, client, prestataire, contexte) {
  // Le client a-t-il confirmé ?
  const reponse = await envoyerMessageClaude(
    from,
    'client',
    prestataire.id,
    getSystemPromptClient(prestataire),
    `Le client répond : "${body}"
    
    Est-ce une confirmation (OUI) ou un refus (NON) ?
    Réponds UNIQUEMENT par : OUI ou NON`
  );

  const confirmation = reponse.trim().toUpperCase();

  if (confirmation === 'NON') {
    // Recommencer depuis le début
    await sauvegarderConversation(from, 'client', prestataire.id, []);
    await demarrerReservation(from, client, prestataire);
    return;
  }

  // Récupérer le créneau choisi depuis la conversation
  const messageSysteme = [...contexte]
    .reverse()
    .find(m => m.role === 'system' && m.content.includes('creneau_choisi'));

  if (!messageSysteme) {
    await demarrerReservation(from, client, prestataire);
    return;
  }

  const donnees = JSON.parse(messageSysteme.content);

  // Créer la réservation dans Supabase
  const reservation = await creerReservation({
    prestataire_id: prestataire.id,
    client_id: client.id,
    service_id: donnees.service_id,
    date: donnees.date,
    heure: donnees.heure,
    statut: 'confirme',
  });

  // Mettre à jour le prénom du client si on ne l'a pas encore
  if (!client.prenom) {
    const { default: supabase } = await import('./supabaseService.js');
    await supabase.from('clients').update({ langue: 'fr' }).eq('id', client.id);
  }

  // Message de confirmation au client
  const messageClient =
    `✅ Réservation confirmée !\n\n` +
    `📋 Détails :\n` +
    `Service : ${donnees.service_nom}\n` +
    `Date : ${formaterDate(donnees.date)}\n` +
    `Heure : ${donnees.heure}\n` +
    `Chez : ${prestataire.nom}\n\n` +
    `Vous recevrez un rappel la veille. À bientôt !`;

  await envoyerMessage(from, messageClient);

  // Notifier le prestataire
  const messagePrestataire =
    `🔔 Nouvelle réservation !\n\n` +
    `Service : ${donnees.service_nom}\n` +
    `Date : ${formaterDate(donnees.date)}\n` +
    `Heure : ${donnees.heure}\n` +
    `Client : ${client.prenom || 'Nouveau client'} (${from})`;

  await envoyerMessage(prestataire.telephone, messagePrestataire);

  // Réinitialiser la conversation pour la prochaine fois
  await sauvegarderConversation(from, 'client', prestataire.id, []);

  console.log(`Réservation créée : ${reservation.id}`);
}

// ================================
// ANNULATION PAR LE CLIENT
// ================================
async function traiterAnnulationClient(from, client) {
  if (!client) {
    await envoyerMessage(from, `Aucune réservation trouvée pour ce numéro.`);
    return;
  }

  // Chercher la prochaine réservation confirmée du client
  const { default: supabase } = await import('./supabaseService.js');
  const { data: reservations } = await supabase
    .from('reservations')
    .select(
      `
      *,
      services (nom),
      prestataires (nom, telephone)
    `
    )
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

  // Annuler la réservation
  const { annulerReservation } = await import('./supabaseService.js');
  await annulerReservation(reservation.id, 'client');

  // Notifier le prestataire
  const { notifierAnnulation } = await import('./notificationService.js');
  await notifierAnnulation(
    { ...reservation, clients: { ...client, telephone: from } },
    'client'
  );

  await envoyerMessage(
    from,
    `✅ Votre rendez-vous du ${formaterDate(reservation.date)} ` +
      `à ${reservation.heure.substring(0, 5)} chez ${reservation.prestataires.nom} ` +
      `a bien été annulé.`
  );
}
