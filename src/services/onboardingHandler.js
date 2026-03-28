import {
  getOnboardingSession,
  creerOnboardingSession,
  mettreAJourOnboardingSession,
  supprimerOnboardingSession,
  creerPrestataire,
} from './supabaseService.js';
import { envoyerMessage } from './whatsappService.js';
import { envoyerMessageClaude } from './claudeService.js';

// ================================
// SYSTEM PROMPT ONBOARDING
// ================================
const SYSTEM_PROMPT_ONBOARDING = `Tu es l'assistant d'onboarding de Riserv, une plateforme de réservation WhatsApp pour les professionnels à Maurice.

Ton rôle est de guider un nouveau prestataire pour configurer son établissement étape par étape.

RÈGLES IMPORTANTES :
- Réponds toujours dans la langue du prestataire (français, anglais ou créole mauricien)
- Sois chaleureux, encourageant et concis
- Ne pose qu'une seule question à la fois
- Confirme toujours ce que tu as compris avant de passer à l'étape suivante
- Si une réponse est incomplète ou ambiguë, redemande poliment

ÉTAPES À SUIVRE :
1. Demander le nom de l'établissement
2. Demander les services proposés (nom, durée, prix) — un par un ou en liste
3. Demander les jours et horaires d'ouverture

FORMAT POUR EXTRAIRE LES SERVICES :
Quand le prestataire donne ses services, extrais chaque service sous la forme :
- Nom du service
- Durée en minutes
- Prix en roupies mauriciennes

FORMAT POUR LES HORAIRES :
Extrais les horaires sous la forme :
{ "lun": {"debut": "09:00", "fin": "18:00", "ouvert": true}, ... }
Pour les jours fermés : {"debut": null, "fin": null, "ouvert": false}`;

// ================================
// POINT D'ENTRÉE PRINCIPAL
// ================================
export async function handleOnboarding(from, body, sessionExistante) {
  // Pas de session existante → c'est le tout premier message
  if (!sessionExistante) {
    await demarrerOnboarding(from);
    return;
  }

  // Session existante → continuer selon l'étape courante
  switch (sessionExistante.etape_courante) {
    case 'etape_1_nom':
      await traiterEtape1(from, body, sessionExistante);
      break;
    case 'etape_2_services':
      await traiterEtape2(from, body, sessionExistante);
      break;
    case 'etape_3_horaires':
      await traiterEtape3(from, body, sessionExistante);
      break;
    default:
      await envoyerMessage(
        from,
        `Une erreur s'est produite. Tapez "RISERV PRO" pour recommencer.`
      );
  }
}

// ================================
// DÉMARRAGE DE L'ONBOARDING
// ================================
async function demarrerOnboarding(from) {
  // Créer la session en Supabase
  await creerOnboardingSession(from);

  // Message de bienvenue
  await envoyerMessage(
    from,
    `Bienvenue sur Riserv ! 🎉\n\n` +
      `Je vais vous aider à configurer votre établissement en 3 étapes rapides.\n\n` +
      `Étape 1/3 — Quel est le nom de votre établissement ?`
  );
}

// ================================
// ÉTAPE 1 — NOM DE L'ÉTABLISSEMENT
// ================================
async function traiterEtape1(from, body, session) {
  // Utiliser Claude pour valider et extraire le nom
  const reponse = await envoyerMessageClaude(
    from,
    'onboarding',
    null,
    SYSTEM_PROMPT_ONBOARDING,
    `Le prestataire répond à "Quel est le nom de votre établissement ?" avec : "${body}"
    
    Si c'est un nom valide, réponds EXACTEMENT sous ce format JSON et rien d'autre :
    {"valide": true, "nom": "le nom extrait", "message": "message de confirmation chaleureux + annonce étape 2 en demandant les services"}
    
    Si ce n'est pas un nom valide ou si c'est incompréhensible, réponds :
    {"valide": false, "message": "message pour redemander le nom"}`
  );

  let parsed;
  try {
    parsed = JSON.parse(reponse);
  } catch {
    // Si Claude ne renvoie pas du JSON propre, on réessaie
    await envoyerMessage(
      from,
      `Pouvez-vous me donner le nom de votre établissement ?`
    );
    return;
  }

  if (!parsed.valide) {
    await envoyerMessage(from, parsed.message);
    return;
  }

  // Sauvegarder le nom et passer à l'étape 2
  await mettreAJourOnboardingSession(from, {
    etape_courante: 'etape_2_services',
    donnees_collectees: {
      ...session.donnees_collectees,
      nom: parsed.nom,
    },
  });

  await envoyerMessage(from, parsed.message);
}

// ================================
// ÉTAPE 2 — SERVICES
// ================================
async function traiterEtape2(from, body, session) {
  // Mots clés pour passer à l'étape suivante
  const motsClesTermine = [
    'c est tout',
    "c'est tout",
    "c'est tout",
    'terminé',
    'termine',
    'fini',
    'done',
    'fin',
    'next',
    'suivant',
  ];
  const messageNormalise = body.toLowerCase().trim();
  const veutPasser = motsClesTermine.some(mot =>
    messageNormalise.includes(mot)
  );

  // Vérifier s'il a déjà des services et veut passer
  const servicesExistants = session.donnees_collectees.services || [];

  if (veutPasser && servicesExistants.length > 0) {
    // Passer à l'étape 3
    await mettreAJourOnboardingSession(from, {
      etape_courante: 'etape_3_horaires',
    });

    const listeServices = servicesExistants
      .map(s => `• ${s.nom} — ${s.duree_minutes} min — Rs ${s.prix}`)
      .join('\n');

    await envoyerMessage(
      from,
      `Parfait ! Voici vos services enregistrés :\n\n${listeServices}\n\n` +
        `Étape 3/3 — Quels sont vos jours et horaires d'ouverture ?\n\n` +
        `Exemple : "Lundi au samedi de 9h à 18h, fermé le dimanche"`
    );
    return;
  }

  // Utiliser Claude pour extraire le service
  const reponse = await envoyerMessageClaude(
    from,
    'onboarding',
    null,
    SYSTEM_PROMPT_ONBOARDING,
    `Le prestataire "${session.donnees_collectees.nom}" donne ses services.
    Services déjà enregistrés : ${JSON.stringify(servicesExistants)}
    Nouveau message : "${body}"
    
    Extrais le ou les nouveaux services mentionnés et réponds EXACTEMENT sous ce format JSON :
    {
      "services_extraits": [
        {"nom": "Coupe femme", "duree_minutes": 45, "prix": 350}
      ],
      "message": "confirmation des services extraits + demander s il y en a d autres ou s il peut taper 'c est tout' pour continuer"
    }
    
    Si aucun service n'est compréhensible :
    {"services_extraits": [], "message": "message pour redemander en donnant un exemple"}`
  );

  let parsed;
  try {
    parsed = JSON.parse(reponse);
  } catch {
    await envoyerMessage(
      from,
      `Donnez-moi vos services un par un.\n` +
        `Exemple : "Coupe femme 45 minutes Rs 350"`
    );
    return;
  }

  if (parsed.services_extraits.length === 0) {
    await envoyerMessage(from, parsed.message);
    return;
  }

  // Ajouter les nouveaux services à la liste existante
  const tousLesServices = [...servicesExistants, ...parsed.services_extraits];

  await mettreAJourOnboardingSession(from, {
    donnees_collectees: {
      ...session.donnees_collectees,
      services: tousLesServices,
    },
  });

  await envoyerMessage(from, parsed.message);
}

// ================================
// ÉTAPE 3 — HORAIRES
// ================================
async function traiterEtape3(from, body, session) {
  // Utiliser Claude pour extraire les horaires
  const reponse = await envoyerMessageClaude(
    from,
    'onboarding',
    null,
    SYSTEM_PROMPT_ONBOARDING,
    `Le prestataire "${session.donnees_collectees.nom}" donne ses horaires.
    Message : "${body}"
    
    Extrais les horaires et réponds EXACTEMENT sous ce format JSON :
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
      "message": "récapitulatif des horaires en langage naturel"
    }
    
    Si les horaires sont incompréhensibles :
    {"valide": false, "message": "message pour redemander avec un exemple"}`
  );

  let parsed;
  try {
    parsed = JSON.parse(reponse);
  } catch {
    await envoyerMessage(
      from,
      `Pouvez-vous préciser vos horaires ?\n` +
        `Exemple : "Lundi au samedi de 9h à 18h, fermé le dimanche"`
    );
    return;
  }

  if (!parsed.valide) {
    await envoyerMessage(from, parsed.message);
    return;
  }

  // Tout est collecté → créer le prestataire
  await finaliserOnboarding(from, session, parsed.horaires, parsed.message);
}

// ================================
// FINALISATION — CRÉER LE PRESTATAIRE
// ================================
async function finaliserOnboarding(from, session, horaires, messageHoraires) {
  const donnees = session.donnees_collectees;

  // Générer le slug à partir du nom
  // ex: "Salon Fatima" → "salon-fatima"
  const slug = donnees.nom
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // supprimer les accents
    .replace(/[^a-z0-9]+/g, '-') // remplacer les caractères spéciaux par -
    .replace(/^-|-$/g, ''); // supprimer les - en début/fin

  // Vérifier que le slug est unique — si pas, ajouter un suffixe
  const slugFinal = await genererSlugUnique(slug);

  // Créer le prestataire dans Supabase
  const prestataire = await creerPrestataire({
    telephone: from,
    nom: donnees.nom,
    slug: slugFinal,
    plan: 'starter',
    statut_abonnement: 'actif',
    date_expiration: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0],
    horaires,
  });

  // Créer les services dans Supabase
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

  // Supprimer la session d'onboarding — elle n'est plus nécessaire
  await supprimerOnboardingSession(from);

  // Générer le lien client unique
  const numeroRiserv =
    process.env.TWILIO_NUMBER?.replace('+', '') || 'XXXXXXXXXX';
  const lienClient = `https://wa.me/${numeroRiserv}?text=${encodeURIComponent(donnees.nom)}`;

  // Message de félicitations
  const listeServices = donnees.services
    .map(s => `• ${s.nom} — ${s.duree_minutes} min — Rs ${s.prix}`)
    .join('\n');

  await envoyerMessage(
    from,
    `🎉 Félicitations ! Votre établissement est configuré sur Riserv.\n\n` +
      `📋 Récapitulatif :\n` +
      `Nom : ${donnees.nom}\n\n` +
      `Services :\n${listeServices}\n\n` +
      `Horaires : ${messageHoraires}\n\n` +
      `🔗 Votre lien client à partager :\n${lienClient}\n\n` +
      `Partagez ce lien sur vos réseaux sociaux, votre carte de visite et votre Google Maps.\n\n` +
      `Pour gérer votre agenda, écrivez-moi directement ici. Tapez "aide" si vous avez besoin d'assistance.`
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

  // Si le slug existe déjà, ajouter un numéro
  const slugsExistants = data.map(p => p.slug);
  let compteur = 2;
  let slugCandidat = `${slug}-${compteur}`;

  while (slugsExistants.includes(slugCandidat)) {
    compteur++;
    slugCandidat = `${slug}-${compteur}`;
  }

  return slugCandidat;
}
