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
  reinitialiserPrestataireConversation,
} from './supabaseService.js';
import { envoyerMessage } from './whatsappService.js';
import { envoyerMessageClaude, estMessagePertinent } from './claudeService.js';
import { estServiceDisponible } from '../middlewares/verifierAcces.js';
import { traiterSignalementPrioritaire } from './signalementUtils.js';
import { notifierPrestataireClientBloque18h } from './upgradeHandler.js';
import {
  getProchainsJoursOuvres,
  getCreneauxLibres,
  formaterDate,
} from '../utils/dateUtils.js';
import { trackConsommationToken, getMessageQuotaRestant, SEUIL_ALERTE } from './rateLimitService.js';
import { estimerTokens } from '../utils/tokenEstimator.js';

const STOPWORDS_MATCH = new Set([
  'the', 'and', 'for', 'you', 'are', 'not', 'but', 'with', 'from', 'this', 'that',
  'avec', 'dans', 'chez', 'cette', 'comme', 'aussi', 'plus', 'tout', 'tous', 'toute', 'toutes',
  'bien', 'voir', 'faire', 'leur', 'meme', 'memes', 'ceux', 'celle', 'celles',
  'sont', 'est', 'etais', 'ete', 'sans', 'sous', 'donc', 'ainsi',
  'une', 'des', 'les', 'aux', 'son', 'ses', 'mes', 'tes', 'nos', 'vos', 'mon', 'ton', 'ma', 'ta',
  'et', 'je', 'tu', 'il', 'elle', 'on', 'ils', 'elles', 'nous', 'vous',
  'que', 'qui', 'quoi', 'dont', 'par', 'sur', 'vers', 'chez', 'merci', 'svp', 'please',
  'bonjour', 'salut', 'hello', 'coucou', 'hey', 'alo',
  'pour', 'votre', 'notre', 'leurs', 'avez', 'avons', 'pouvez', 'peux', 'peut',
  'veux', 'veut', 'vouloir', 'souhaite', 'souhaitez', 'cherche', 'cherches', 'cherchez',
  'besoin', 'besoins', 'prendre', 'prend', 'donner', 'donnez', 'indiquer', 'preciser',
  'jour', 'soir', 'matin', 'aujourdhui', 'demain', 'rendez', 'rdv',
  'oui', 'non', 'ok', 'si', 'ici', 'lah', 'là',
  'very', 'much', 'have', 'has', 'had', 'want', 'need', 'like',
]);

function normalizePourMatch(s) {
  if (!s || typeof s !== 'string') return '';
  return s
    .toLowerCase()
    .replace(/'/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function construireCorpusClient(body, contexte, opts = {}) {
  const maxMessages = opts.maxMessages ?? 35;
  const derniersAssistant = opts.derniersAssistant ?? 0;
  const parts = [(body || '').trim()];
  const hist = Array.isArray(contexte) ? contexte : [];

  if (derniersAssistant > 0) {
    const assistants = hist
      .filter(m => m.role === 'assistant')
      .slice(-derniersAssistant);
    for (const m of assistants) {
      if (typeof m.content === 'string') {
        const t = m.content.trim();
        if (t) parts.push(t);
      }
    }
  }

  for (const m of hist.slice(-maxMessages)) {
    if (m.role === 'user' && typeof m.content === 'string') {
      const t = m.content.trim();
      if (t) parts.push(t);
    }
  }
  const seen = new Set();
  const dedup = [];
  for (const p of parts) {
    const k = p.slice(0, 200);
    if (!seen.has(k)) {
      seen.add(k);
      dedup.push(p);
    }
  }
  return dedup.join('\n');
}

function appendUserPuisAssistant(messages, body, texteAssistant) {
  const out = Array.isArray(messages) ? [...messages] : [];
  const last = out[out.length - 1];
  if (!(last?.role === 'user' && last?.content === body)) {
    out.push({ role: 'user', content: body });
  }
  out.push({ role: 'assistant', content: texteAssistant });
  return out;
}

function tokensDepuisCorpusNormalise(corpusNorm) {
  return corpusNorm
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length >= 2 && !STOPWORDS_MATCH.has(t));
}

function prestatairesMatchantServices(liste, corpusNorm, tokens) {
  const tokensForts = tokens.filter(t => t.length >= 3);
  return liste.filter(p => {
    const servicesActifs = (p.services || []).filter(s => s.actif);
    return servicesActifs.some(s => {
      const serviceNom = normalizePourMatch(s.nom || '');
      if (!serviceNom) return false;
      if (corpusNorm.includes(serviceNom)) return true;
      const motsService = serviceNom.split(/\s+/).filter(w => w.length >= 2);
      if (motsService.some(m => m.length >= 3 && corpusNorm.includes(m))) return true;
      return tokensForts.some(t => serviceNom.includes(t));
    });
  });
}

function intentionServiceProbable(_corpusNorm, tokens) {
  if (tokens.some(t => t.length >= 4)) return true;
  if (tokens.filter(t => t.length >= 3).length >= 2) return true;
  return false;
}

/** Inviter des pros à s'inscrire — bloc réutilisable */
const SUGGESTION_INVITER_PRESTATAIRE_RISERV =
  `Connaissez-vous un prestataire ou une entreprise qui pourrait vous convenir ? ` +
  `Si oui, vous pouvez leur suggérer de rejoindre Riserv sur WhatsApp (inscription simple et gratuite) : ` +
  `ainsi, vous pourrez réserver plus facilement les prochaines fois.`;

const MOTS_TYPE_SERVICE = new Set([
  'coiffure',
  'coiffeur',
  'coiffeuse',
  'coupe',
  'barbe',
  'rasage',
  'coloration',
  'brushing',
  'massage',
  'manucure',
  'pedicure',
  'ongles',
  'ongle',
  'nails',
  'vernis',
  'soin',
  'soins',
  'facial',
  'epilation',
  'wax',
  'lissage',
  'extensions',
  'maquillage',
  'tatouage',
  'physio',
  'osteo',
  'dentiste',
  'veterinaire',
  'yoga',
  'pilates',
  'fitness',
  'haircut',
  'hair',
  'beard',
  'waxing',
  'spa',
]);

function estRechercheParTypeDeService(corpusNorm, tokens) {
  for (const t of tokens) {
    if (t.length >= 3 && MOTS_TYPE_SERVICE.has(t)) return true;
  }
  const fragments = [
    'coiffure',
    'massage',
    'manucure',
    'coupe',
    'barbe',
    'soin',
    'epilation',
    'pedicure',
    'coloration',
    'rasage',
  ];
  return fragments.some(f => corpusNorm.includes(f));
}

function messageAssistantDemandaitNomOuListePrestataire(contexte) {
  const assistants = (Array.isArray(contexte) ? contexte : [])
    .filter(m => m.role === 'assistant')
    .slice(-5);
  const marqueurs = [
    'nom du prestataire choisi',
    'répondez avec le nom',
    'nom du prestataire',
    'prestataires qui pourraient vous convenir',
    "j'ai trouvé ces prestataires",
    'trouver le bon prestataire',
    'type de service recherché',
  ];
  for (let i = assistants.length - 1; i >= 0; i--) {
    const c = (assistants[i].content || '').toLowerCase();
    if (marqueurs.some(x => c.includes(x))) return true;
  }
  return false;
}

function estRechercheParNomEtablissement(body) {
  const b = (body || '').toLowerCase();
  return (
    /\b(salon|institut|spa|clinique|cabinet|studio|centre|beauty|lounge|barbershop|onglerie|barbier)\b/.test(
      b
    ) ||
    /\b(l'|la |le )?(établissement|entreprise|boutique)\b/.test(b) ||
    /\bchez\s+[a-zàâäéèêëïîôùûç]/i.test(b)
  );
}

function estProbableNomOuEtablissementSansTypeService(tokens, corpusNorm) {
  if (tokens.length < 2 || tokens.length > 6) return false;
  if (estRechercheParTypeDeService(corpusNorm, tokens)) return false;
  return tokens.every(t => t.length >= 3);
}

/**
 * Aucun prestataire en base ne correspond : distinguer recherche par type de prestation
 * vs recherche par nom d'établissement / réponse à « donnez le nom ».
 */
function casRechercheSansPrestataire(body, contexte, corpusNorm, tokens) {
  const typeService = estRechercheParTypeDeService(corpusNorm, tokens);
  const nomEtab = estRechercheParNomEtablissement(body);
  const suiteListe = messageAssistantDemandaitNomOuListePrestataire(contexte);
  const probableNom = estProbableNomOuEtablissementSansTypeService(tokens, corpusNorm);

  if ((nomEtab || suiteListe || probableNom) && !typeService) {
    return 'etablissement_introuvable';
  }
  if (intentionServiceProbable(corpusNorm, tokens)) {
    return 'service_sans_partenaire';
  }
  return 'invitation_generique';
}

/** Le client veut quitter le prestataire courant et en choisir un autre */
function veutChangerDePrestataire(body) {
  const b = (body || '').toLowerCase();
  return (
    /\bautre prestataire\b/.test(b) ||
    /\bun autre prestataire\b/.test(b) ||
    /\b(prene|prendre|cherche|veux|souhaite).{0,40}(rdv|rendez-vous).{0,30}(autre|ailleurs)\b/.test(
      b
    ) ||
    /\bchanger de (prestataire|salon|coiffeur|établissement)\b/.test(b) ||
    /\bpas chez (lui|elle|eux)\b/.test(b) ||
    /\b(pas le bon|ce n'est pas le bon) (salon|prestataire)\b/.test(b) ||
    /\b(réserver|rdv|rendez-vous)\s+(ailleurs|autre part|chez un autre)\b/.test(b) ||
    /\bprendre\s+rendez[- ]?vous\s+avec\s+un\s+autre\b/.test(b)
  );
}

/** Relance / clarification dans un flux réservation (ne doit pas être classé hors-sujet) */
function estRelanceOuClarificationReservation(body) {
  const b = (body || '').toLowerCase().trim();
  if (b.length > 100) return false;
  return (
    /\b(je fais quoi|qu'est-?ce que je fais|comment je (fais|dois)|comment faire|et maintenant|je comprends pas|je ne comprends pas|pourquoi ça|ça marche pas|ça ne marche pas)\b/.test(
      b
    ) ||
    /^(alors|donc)\s*\?*\s*$/i.test(b) ||
    (b.length < 55 && /\b(alors|donc)\b/.test(b) && /\?/.test(b))
  );
}

function doitIgnorerFiltrePertinence(body) {
  return veutChangerDePrestataire(body) || estRelanceOuClarificationReservation(body);
}

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
    if (body.trim().toUpperCase() === 'ANNULER') {
      console.log(`[CLIENT ${clientId}] → Mot-clé ANNULER détecté`);
      await traiterAnnulationClient(from, clientExistant, clientId);
      return;
    }

    console.log(`[CLIENT ${clientId}] Chargement conversation...`);
    let conversation = await getConversation(from);
    let contexte = conversation?.messages || [];
    console.log(`[CLIENT ${clientId}] Historique: ${contexte.length} messages`);

    const veutAutrePrestataire = veutChangerDePrestataire(body);
    if (veutAutrePrestataire && conversation?.prestataire_id) {
      console.log(`[CLIENT ${clientId}] ↪️ Changement de prestataire demandé — réinitialisation du lien conversation`);
      await reinitialiserPrestataireConversation(from);
      conversation = await getConversation(from);
      contexte = conversation?.messages || [];
    }

    if (await traiterSignalementPrioritaire(from, body, contexte, 'client')) {
      return;
    }

    // Vérification bannissement client (après signalement : le client peut toujours signaler un problème)
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

    console.log(`[CLIENT ${clientId}] Détermination prestataire...`);
    const prestataire = await determinerPrestataire(
      from,
      body,
      contexte,
      conversation,
      clientId,
      { ignorerAssistantPourMatchPrestataire: veutAutrePrestataire }
    );

    if (!prestataire) {
      console.log(`[CLIENT ${clientId}] ⚠️ Prestataire non trouvé`);
      await gererPrestataireNonIdentifie(from, body, contexte, conversation, clientId);
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

    // Filtre hors-sujet (pas sur les relances / « autre prestataire » — risque de faux hors-sujet)
    if (contexte.length > 0) {
      let pertinent = true;
      if (!doitIgnorerFiltrePertinence(body)) {
        console.log(`[CLIENT ${clientId}] Vérification pertinence message...`);
        pertinent = await estMessagePertinent(body);
      } else {
        console.log(
          `[CLIENT ${clientId}] Filtre pertinence ignoré (clarification réservation ou changement de prestataire)`
        );
      }
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
// GÉRER CAS PRESTATAIRE NON IDENTIFIÉ
// ================================
async function gererPrestataireNonIdentifie(from, body, contexte, conversation, clientId) {
  const { default: supabase } = await import('./supabaseService.js');
  const { data: prestataires } = await supabase
    .from('prestataires')
    .select('id, nom, slug, services(nom, actif)')
    .eq('statut_abonnement', 'actif');

  const liste = prestataires || [];
  const corpus = construireCorpusClient(body, contexte);
  const corpusNorm = normalizePourMatch(corpus);
  const tokens = tokensDepuisCorpusNormalise(corpusNorm);
  const candidats = prestatairesMatchantServices(liste, corpusNorm, tokens);

  console.log(`[CLIENT ${clientId}] Recherche prestataires par service`, {
    corpusPreview: corpus.slice(0, 120),
    tokens: tokens.slice(0, 12),
    nbCandidats: candidats.length,
  });

  if (candidats.length > 0) {
    const top = candidats.slice(0, 5);
    const suggestion = top
      .map((p, i) => {
        const services = (p.services || [])
          .filter(s => s.actif)
          .slice(0, 3)
          .map(s => s.nom)
          .join(', ');
        return `${i + 1}. ${p.nom}${services ? ` (${services})` : ''}`;
      })
      .join('\n');

    const messages = conversation?.messages || contexte || [];
    const texteListe =
      `Je peux vous aider 😊\n\n` +
      `J'ai trouvé ces prestataires qui pourraient vous convenir :\n${suggestion}\n\n` +
      `Répondez avec le nom du prestataire choisi pour continuer la réservation.`;
    await sauvegarderConversation(
      from,
      'client',
      null,
      appendUserPuisAssistant(messages, body, texteListe)
    );

    await envoyerMessage(from, texteListe);
    return;
  }

  const exemplesPrestataires = liste
    .slice(0, 5)
    .map(p => p.nom)
    .join(', ');
  const exemplesServices = [...new Set(
    liste
      .flatMap(p => p.services || [])
      .filter(s => s.actif)
      .map(s => s.nom)
  )]
    .slice(0, 6)
    .join(', ');

  const messagesBase = conversation?.messages || contexte || [];

  const cas = casRechercheSansPrestataire(body, contexte, corpusNorm, tokens);

  if (cas === 'service_sans_partenaire') {
    console.log(`[CLIENT ${clientId}] Aucun prestataire ne correspond au type de prestation (historique inclus)`);
    const texteAucun =
      `Merci pour votre message.\n\n` +
      `Pour l'instant, nous n'avons aucun prestataire partenaire inscrit qui propose clairement ce type de prestation dans notre base.\n\n` +
      `${SUGGESTION_INVITER_PRESTATAIRE_RISERV}\n\n` +
      `Vous pouvez aussi :\n` +
      `• nous donner le nom exact d'un établissement déjà partenaire, ou\n` +
      `• préciser un autre type de service (ex. : ${exemplesServices || 'coiffure, massage, soin du visage'}).`;
    await sauvegarderConversation(
      from,
      'client',
      null,
      appendUserPuisAssistant(messagesBase, body, texteAucun)
    );
    await envoyerMessage(from, texteAucun);
    return;
  }

  if (cas === 'etablissement_introuvable') {
    console.log(`[CLIENT ${clientId}] Recherche par nom d'établissement sans correspondance en base`);
    const texteNom =
      `Nous ne trouvons pas cet établissement ou ce prestataire dans notre réseau pour l'instant.\n\n` +
      `${SUGGESTION_INVITER_PRESTATAIRE_RISERV}\n\n` +
      `Vous pouvez réessayer avec le nom exact tel qu'affiché, ou indiquer le type de service recherché (ex. : ${exemplesServices || 'coiffure, massage, manucure'}).`;
    await sauvegarderConversation(
      from,
      'client',
      null,
      appendUserPuisAssistant(messagesBase, body, texteNom)
    );
    await envoyerMessage(from, texteNom);
    return;
  }

  const texteInvit =
    `Je peux vous aider à trouver le bon prestataire 😊\n\n` +
    `Donnez-moi soit :\n` +
    `1) Le nom du prestataire (ex: ${exemplesPrestataires || 'Beauty Lounge'})\n` +
    `ou\n` +
    `2) Le type de service recherché (ex: ${exemplesServices || 'coiffure, massage, manucure'}).\n\n` +
    `💡 Si vous connaissez un professionnel qui n'est pas encore sur Riserv, vous pouvez lui suggérer de s'inscrire sur ce numéro — cela simplifiera vos prochaines réservations.`;
  await sauvegarderConversation(
    from,
    'client',
    null,
    appendUserPuisAssistant(messagesBase, body, texteInvit)
  );
  await envoyerMessage(from, texteInvit);
}

// ================================
// DÉTERMINER LE PRESTATAIRE VISÉ
// ================================
async function determinerPrestataire(
  from,
  body,
  contexte,
  conversation,
  clientId,
  options = {}
) {
  const { ignorerAssistantPourMatchPrestataire = false } = options;

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

  const corpus = construireCorpusClient(body, contexte, {
    derniersAssistant: ignorerAssistantPourMatchPrestataire ? 0 : 3,
  });
  const cNorm = normalizePourMatch(corpus);

  const prestataireTrouve = prestataires.find(p => {
    const nom = normalizePourMatch(p.nom || '');
    const slug = normalizePourMatch((p.slug || '').replace(/-/g, ' '));
    if (!nom && !slug) return false;
    return (
      (nom && (cNorm.includes(nom) || corpus.toLowerCase().includes((p.nom || '').toLowerCase()))) ||
      (slug && cNorm.includes(slug))
    );
  }) || null;

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
