import {
  getRateLimit,
  creerOuMettreAJourRateLimit,
  enregistrerTokenMetric,
} from './supabaseService.js';
import { calculerMinutesRestantes, formaterDuree } from '../utils/tokenEstimator.js';

// ================================
// LIMITES PAR RÔLE ET PLAN
// ================================
const LIMITES_PAR_ROLE = {
  /** Messages IA / heure pour un client en parcours réservation (échanges souvent longs) */
  client: 22,
  onboarding: 20, // Total pour toute la session
  prestataire: {
    starter: 30,
    pro: 100,
    business: 200,
  },
};

const SEUIL_ALERTE = 5;

// ================================
// OBTENIR LA LIMITE SELON LE RÔLE
// ================================
function getLimiteHoraire(role, plan) {
  if (role === 'client') return LIMITES_PAR_ROLE.client;
  if (role === 'onboarding') return LIMITES_PAR_ROLE.onboarding;
  if (role === 'prestataire') {
    return LIMITES_PAR_ROLE.prestataire[plan] || LIMITES_PAR_ROLE.prestataire.starter;
  }
  return 999999; // Admin ou autre = illimité
}

// ================================
// VÉRIFIER LE RATE LIMIT
// ================================
export async function verifierRateLimit(telephone, role, plan) {
  const limite = getLimiteHoraire(role, plan);
  
  // Admin n'a pas de limite
  if (limite === 999999) {
    return { autorise: true, restant: 999999, renouvellement: null };
  }

  const rateLimit = await getRateLimit(telephone);

  if (!rateLimit) {
    return { 
      autorise: true, 
      restant: limite - 1,
      renouvellement: new Date(Date.now() + 60 * 60 * 1000),
      limite: limite
    };
  }

  const heureDebut = new Date(rateLimit.heure_debut);
  const heureActuelle = new Date();
  const diffHeures = (heureActuelle - heureDebut) / (1000 * 60 * 60);

  // Si plus d'1 heure s'est écoulée pour client/prestataire, nouvelle période
  if (role !== 'onboarding' && diffHeures >= 1) {
    return { 
      autorise: true, 
      restant: limite - 1,
      renouvellement: new Date(Date.now() + 60 * 60 * 1000),
      limite: limite
    };
  }

  // Pour onboarding, c'est une limite totale (pas par heure)
  const messagesRestants = limite - rateLimit.nombre_messages;

  if (messagesRestants <= 0) {
    return {
      autorise: false,
      restant: 0,
      renouvellement: role === 'onboarding' 
        ? null 
        : new Date(heureDebut.getTime() + 60 * 60 * 1000),
      limite: limite
    };
  }

  return {
    autorise: true,
    restant: messagesRestants,
    renouvellement: role === 'onboarding' 
      ? null 
      : new Date(heureDebut.getTime() + 60 * 60 * 1000),
    limite: limite
  };
}

// ================================
// INCRÉMENTER LE COMPTEUR
// ================================
export async function incrementerCompteur(telephone, role, plan) {
  const limite = getLimiteHoraire(role, plan);
  await creerOuMettreAJourRateLimit(telephone, role, plan, limite);
  
  const rateLimit = await getRateLimit(telephone);
  return limite - rateLimit.nombre_messages;
}

// ================================
// TRACKER LA CONSOMMATION DE TOKENS
// ================================
export async function trackConsommationToken(telephone, role, processus, tokensEstimes, prestataireId = null) {
  try {
    await enregistrerTokenMetric({
      date: new Date().toISOString().split('T')[0],
      telephone,
      prestataire_id: prestataireId,
      role,
      processus,
      tokens_estimes: tokensEstimes,
    });
  } catch (err) {
    console.error('[RATE_LIMIT] Erreur tracking tokens:', err.message);
  }
}

// ================================
// MESSAGES DE LIMITATION
// ================================

export function getMessageQuotaDepasse(rateLimit, role, plan, langue = 'fr') {
  const minutesRestantes = rateLimit.renouvellement 
    ? calculerMinutesRestantes(rateLimit.renouvellement) 
    : 0;
  const duree = formaterDuree(minutesRestantes);

  // Pour clients
  if (role === 'client') {
    switch (langue) {
      case 'en':
        return (
          `⛔ Message limit reached\n\n` +
          `You have sent ${rateLimit.limite} messages this hour.\n\n` +
          `You can write to us again in ${duree}.\n\n` +
          `Thank you for your understanding! 😊`
        );
      case 'cr':
        return (
          `⛔ Limit mesaz atenn\n\n` +
          `Ou finn anvoy ${rateLimit.limite} mesaz sa ler-la.\n\n` +
          `Ou pou kapav ekrir nou aster dan ${duree}.\n\n` +
          `Mersi pou ou konpreansyon! 😊`
        );
      default:
        return (
          `⛔ Limite de messages atteinte\n\n` +
          `Vous avez envoyé ${rateLimit.limite} messages cette heure.\n\n` +
          `Vous pourrez nous écrire à nouveau dans ${duree}.\n\n` +
          `Merci de votre compréhension ! 😊`
        );
    }
  }

  // Pour onboarding
  if (role === 'onboarding') {
    const supportEmail = process.env.SUPPORT_EMAIL || 'support@riserv.mu';
    
    return (
      `⛔ Trop de tentatives\n\n` +
      `Nous avons remarqué un grand nombre de messages pendant votre inscription.\n\n` +
      `Pour finaliser votre inscription, contactez notre support :\n` +
      `📧 ${supportEmail}\n\n` +
      `Nous vous répondrons rapidement !`
    );
  }

  // Pour prestataires
  const nomsPlan = {
    starter: 'Starter',
    pro: 'Pro',
    business: 'Business',
  };

  const limitesUpgrade = {
    starter: 'Pro (100 messages/heure)',
    pro: 'Business (200 messages/heure)',
    business: null,
  };

  const nomPlan = nomsPlan[plan] || 'Starter';
  const upgrade = limitesUpgrade[plan];

  const supportEmail = process.env.SUPPORT_EMAIL || 'support@riserv.mu';

  let messageUpgrade = '';
  if (upgrade) {
    messageUpgrade = `\n\nBesoin de plus ? Passez au plan ${upgrade}\nContactez-nous : ${supportEmail}`;
  }

  return (
    `⛔ Limite de messages atteinte\n\n` +
    `Vous avez envoyé ${rateLimit.limite} messages cette heure (Plan ${nomPlan}).\n\n` +
    `Vous pourrez utiliser le système à nouveau dans ${duree}.` +
    messageUpgrade
  );
}

export function getMessageQuotaRestant(restant, renouvellement, langue, role, plan) {
  const minutesRestantes = renouvellement 
    ? calculerMinutesRestantes(renouvellement) 
    : 0;
  const duree = formaterDuree(minutesRestantes);

  // Pour clients
  if (role === 'client') {
    switch (langue) {
      case 'en':
        return `⚠️ You have ${restant} message${restant > 1 ? 's' : ''} left this hour\n(Renewal in ${duree})`;
      case 'cr':
        return `⚠️ Ou ena ${restant} mesaz ki reste sa ler-la\n(Renouvelman dan ${duree})`;
      default:
        return `⚠️ Il vous reste ${restant} message${restant > 1 ? 's' : ''} cette heure\n(Renouvellement dans ${duree})`;
    }
  }

  // Pour prestataires
  const nomsPlan = {
    starter: 'Starter',
    pro: 'Pro',
    business: 'Business',
  };
  const nomPlan = nomsPlan[plan] || 'Starter';

  return (
    `⚠️ Il vous reste ${restant} message${restant > 1 ? 's' : ''} cette heure\n` +
    `(Renouvellement dans ${duree})\n\n` +
    `Plan : ${nomPlan}`
  );
}

export { SEUIL_ALERTE };
