import {
  getOnboardingSession,
  creerOnboardingSession,
  mettreAJourOnboardingSession,
  supprimerOnboardingSession,
  creerPrestataire,
} from './supabaseService.js';
import { envoyerMessage } from './whatsappService.js';
import { envoyerMessageClaude } from './claudeService.js';
import { trackConsommationToken, getMessageQuotaRestant, SEUIL_ALERTE } from './rateLimitService.js';
import { estimerTokens } from '../utils/tokenEstimator.js';

// ================================
// SYSTEM PROMPT ONBOARDING
// ================================
const SYSTEM_PROMPT_ONBOARDING = `Tu es un(e) agent(e) du service client de Riserv, une plateforme de réservation WhatsApp pour les professionnels à Maurice.

Ton rôle est de guider un nouveau prestataire pour configurer son établissement de façon naturelle et chaleureuse, comme le ferait un vrai conseiller humain.

RÈGLES IMPORTANTES :
- Réponds toujours dans la langue du prestataire (français, anglais ou créole mauricien)
- Sois chaleureux, humain et naturel — jamais robotique
- Ne pose qu'une seule question à la fois
- Confirme ce que tu as compris avant de passer à l'étape suivante
- Ne mentionne jamais des mots clés à taper — déduis toi-même l'intention du prestataire
- Si une réponse est ambiguë, demande confirmation naturellement
- Ne mentionne jamais que tu es une IA

ÉTAPES À SUIVRE :
1. Demander le nom de l'établissement
2. Collecter les services (nom, durée, prix) — laisser le prestataire en donner autant qu'il veut
3. Demander les jours et horaires d'ouverture`;

// ================================
// POINT D'ENTRÉE PRINCIPAL
// ================================
export async function handleOnboarding(from, body, sessionExistante, rateLimit) {
  if (!sessionExistante) {
    await demarrerOnboarding(from);
    return;
  }

  switch (sessionExistante.etape_courante) {
    case 'etape_1_nom':
      await traiterEtape1(from, body, sessionExistante, rateLimit);
      break;
    case 'etape_2_services':
      await traiterEtape2(from, body, sessionExistante, rateLimit);
      break;
    case 'etape_3_horaires':
      await traiterEtape3(from, body, sessionExistante, rateLimit);
      break;
    default:
      await envoyerMessage(
        from,
        `Une erreur s'est produite. Écrivez-moi à nouveau pour recommencer.`
      );
  }
}

// ================================
// DÉMARRAGE DE L'ONBOARDING
// ================================
async function demarrerOnboarding(from) {
  await creerOnboardingSession(from);

  await envoyerMessage(
    from,
    `Bienvenue sur Riserv ! 🎉\n\n` +
      `Je vais vous aider à configurer votre établissement en quelques minutes.\n\n` +
      `Pour commencer — quel est le nom de votre établissement ?`
  );
}

// ================================
// ÉTAPE 1 — NOM DE L'ÉTABLISSEMENT
// ================================
async function traiterEtape1(from, body, session, rateLimit) {
  const systemPrompt = SYSTEM_PROMPT_ONBOARDING;
  const userPrompt = `Le prestataire répond à "Quel est le nom de votre établissement ?" avec : "${body}"

    Réponds EXACTEMENT sous ce format JSON et rien d'autre :
    {"valide": true, "nom": "le nom extrait", "message": "message de confirmation chaleureux + demande naturelle des services avec un exemple"}

    Si ce n'est pas un nom valide :
    {"valide": false, "message": "message pour redemander naturellement"}`;

  const reponse = await envoyerMessageClaude(
    from,
    'onboarding',
    null,
    systemPrompt,
    userPrompt
  );

  // Tracker la consommation
  await trackConsommationToken(
    from,
    'onboarding',
    'etape_1_nom',
    estimerTokens(systemPrompt + userPrompt + reponse),
    null
  );

  let parsed;
  try {
    const nettoye = reponse.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(nettoye);
  } catch {
    await envoyerMessage(from, `Quel est le nom de votre établissement ?`);
    return;
  }

  if (!parsed.valide) {
    await envoyerMessage(from, parsed.message);
    
    // Alerte quota pour onboarding
    if (rateLimit && rateLimit.restant <= SEUIL_ALERTE) {
      const alerteMsg = `⚠️ Il vous reste ${rateLimit.restant} message${rateLimit.restant > 1 ? 's' : ''} pour finaliser votre inscription`;
      await envoyerMessage(from, alerteMsg);
    }
    return;
  }

  await mettreAJourOnboardingSession(from, {
    etape_courante: 'etape_2_services',
    donnees_collectees: {
      ...session.donnees_collectees,
      nom: parsed.nom,
    },
  });

  await envoyerMessage(from, parsed.message);
  
  // Alerte quota
  if (rateLimit && rateLimit.restant <= SEUIL_ALERTE) {
    const alerteMsg = `⚠️ Il vous reste ${rateLimit.restant} message${rateLimit.restant > 1 ? 's' : ''} pour finaliser votre inscription`;
    await envoyerMessage(from, alerteMsg);
  }
}

// ================================
// ÉTAPE 2 — SERVICES
// Claude décide lui-même si le prestataire a terminé
// ================================
async function traiterEtape2(from, body, session, rateLimit) {
  const servicesExistants = session.donnees_collectees.services || [];

  const systemPrompt = SYSTEM_PROMPT_ONBOARDING;
  const userPrompt = `Le prestataire "${session.donnees_collectees.nom}" configure ses services.
    Services déjà enregistrés : ${JSON.stringify(servicesExistants)}
    Nouveau message du prestataire : "${body}"

    Analyse ce message et réponds EXACTEMENT sous ce format JSON :
    {
      "services_extraits": [{"nom": "...", "duree_minutes": 45, "prix": 350}],
      "a_termine": false,
      "message": "..."
    }

    Règles pour "a_termine" :
    - true si le prestataire indique clairement qu'il n'a plus de services à ajouter (peu importe comment il le dit)
    - true si le prestataire pose une question sur autre chose ou change de sujet
    - false si le prestataire donne encore des services ou si ce n'est pas clair

    Règles pour "message" :
    - Si a_termine false et services extraits : confirme les services ajoutés et demande naturellement s'il en a d'autres
    - Si a_termine false et aucun service : redemande naturellement avec un exemple
    - Si a_termine true : enchaîne directement sur les horaires de façon naturelle

    NE JAMAIS demander au prestataire de taper un mot clé précis.`;

  const reponse = await envoyerMessageClaude(
    from,
    'onboarding',
    null,
    systemPrompt,
    userPrompt
  );

  // Tracker la consommation
  await trackConsommationToken(
    from,
    'onboarding',
    'etape_2_services',
    estimerTokens(systemPrompt + userPrompt + reponse),
    null
  );

  let parsed;
  try {
    const nettoye = reponse.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(nettoye);
  } catch {
    await envoyerMessage(
      from,
      `Quels services proposez-vous ? Donnez-moi le nom, la durée et le prix.\nExemple : Coupe femme, 45 minutes, Rs 350`
    );
    return;
  }

  const tousLesServices = [
    ...servicesExistants,
    ...(parsed.services_extraits || []),
  ];

  if (tousLesServices.length > 0) {
    await mettreAJourOnboardingSession(from, {
      donnees_collectees: {
        ...session.donnees_collectees,
        services: tousLesServices,
      },
    });
  }

  if (parsed.a_termine && tousLesServices.length > 0) {
    await mettreAJourOnboardingSession(from, {
      etape_courante: 'etape_3_horaires',
    });
  }

  await envoyerMessage(from, parsed.message);
  
  // Alerte quota
  if (rateLimit && rateLimit.restant <= SEUIL_ALERTE) {
    const alerteMsg = `⚠️ Il vous reste ${rateLimit.restant} message${rateLimit.restant > 1 ? 's' : ''} pour finaliser votre inscription`;
    await envoyerMessage(from, alerteMsg);
  }
}

// ================================
// ÉTAPE 3 — HORAIRES
// ================================
async function traiterEtape3(from, body, session, rateLimit) {
  const systemPrompt = SYSTEM_PROMPT_ONBOARDING;
  const userPrompt = `Le prestataire "${session.donnees_collectees.nom}" donne ses horaires.
    Message : "${body}"

    Réponds EXACTEMENT sous ce format JSON :
    {
      "valide": true,
      "horaires": {
        "lun": {"debut": "09:00", "fin": "18:00", "ouvert": true},
        "mar": {"debut": "09:00", "fin": "18:00", "ouvert": true},
        "mer": {"debut": "09:00", "fin": "18:00", "ouvert": true},
        "jeu": {"debut": "09:00", "fin": "18:00", "ouvert": true},
        "ven": {"debut": "09:00", "fin": "18:00", "ouvert": true},
        "sam": {"debut": "09:00", "fin": "13:00", "ouvert": true},
        "dim": {"debut": null, "fin": null, "ouvert": false}
      },
      "message": "récapitulatif naturel des horaires"
    }

    Si les horaires sont incompréhensibles :
    {"valide": false, "message": "message pour redemander naturellement avec un exemple"}`;

  const reponse = await envoyerMessageClaude(
    from,
    'onboarding',
    null,
    systemPrompt,
    userPrompt
  );

  // Tracker la consommation
  await trackConsommationToken(
    from,
    'onboarding',
    'etape_3_horaires',
    estimerTokens(systemPrompt + userPrompt + reponse),
    null
  );

  let parsed;
  try {
    const nettoye = reponse.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(nettoye);
  } catch {
    await envoyerMessage(
      from,
      `Pouvez-vous me préciser vos horaires ?\nExemple : du lundi au samedi de 9h à 18h, fermé le dimanche`
    );
    return;
  }

  if (!parsed.valide) {
    await envoyerMessage(from, parsed.message);
    
    // Alerte quota
    if (rateLimit && rateLimit.restant <= SEUIL_ALERTE) {
      const alerteMsg = `⚠️ Il vous reste ${rateLimit.restant} message${rateLimit.restant > 1 ? 's' : ''} pour finaliser votre inscription`;
      await envoyerMessage(from, alerteMsg);
    }
    return;
  }

  await finaliserOnboarding(from, session, parsed.horaires, parsed.message);
}

// ================================
// FINALISATION — CRÉER LE PRESTATAIRE
// ================================
async function finaliserOnboarding(from, session, horaires, messageHoraires) {
  const donnees = session.donnees_collectees;

  const slug = donnees.nom
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const slugFinal = await genererSlugUnique(slug);

  const prestataire = await creerPrestataire({
    telephone: from,
    nom: donnees.nom,
    slug: slugFinal,
    plan: 'starter',
    statut_abonnement: 'actif',
    essai_gratuit: true,
    ambassadeur: false,
    date_expiration: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0],
    horaires,
  });

  const { default: supabase } = await import('./supabaseService.js');

  for (const service of donnees.services) {
    await supabase.from('services').insert({
      prestataire_id: prestataire.id,
      nom: service.nom,
      duree_minutes: service.duree_minutes,
      prix: service.prix,
      actif: true,
    });
  }

  await supprimerOnboardingSession(from);

  const numeroRiserv =
    process.env.META_PHONE_ID ||
    process.env.TWILIO_NUMBER?.replace('+', '') ||
    'XXXXXXXXXX';
  const lienClient = `https://wa.me/${numeroRiserv}?text=${encodeURIComponent(donnees.nom)}`;

  const listeServices = donnees.services
    .map(s => `• ${s.nom} — ${s.duree_minutes} min — Rs ${s.prix}`)
    .join('\n');

  await envoyerMessage(
    from,
    `🎉 Votre établissement est maintenant en ligne sur Riserv !\n\n` +
      `Voici ce que j'ai enregistré :\n\n` +
      `📍 ${donnees.nom}\n\n` +
      `💈 Services :\n${listeServices}\n\n` +
      `🕐 Horaires : ${messageHoraires}\n\n` +
      `🔗 Votre lien de réservation :\n${lienClient}\n\n` +
      `Partagez ce lien avec vos clients — sur vos réseaux, votre carte de visite, Google Maps.\n\n` +
      `Votre premier mois est entièrement gratuit, sans engagement. Si vous n'êtes pas satisfait, vous ne payez rien.\n\n` +
      `Pour gérer votre agenda ou modifier vos services, écrivez-moi directement ici à tout moment.`
  );
}

// ================================
// UTILITAIRE — SLUG UNIQUE
// ================================
async function genererSlugUnique(slug) {
  const { default: supabase } = await import('./supabaseService.js');

  const { data } = await supabase
    .from('prestataires')
    .select('slug')
    .ilike('slug', `${slug}%`);

  if (!data || data.length === 0) return slug;

  const slugsExistants = data.map(p => p.slug);
  let compteur = 2;
  let slugCandidat = `${slug}-${compteur}`;

  while (slugsExistants.includes(slugCandidat)) {
    compteur++;
    slugCandidat = `${slug}-${compteur}`;
  }

  return slugCandidat;
}
