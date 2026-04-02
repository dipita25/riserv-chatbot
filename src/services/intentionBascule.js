import { detecterIntention } from './claudeService.js';

function normalizeForMatch(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/**
 * Inscription / ajout d’établissement sur Riserv (sans appel IA si les marqueurs suffisent).
 */
export function heuristiqueOnboardingPrestataire(body) {
  const b = normalizeForMatch(body);
  const patterns = [
    /\bajouter (mon|notre|ma) (entreprise|activite|commerce|boutique|salon)\b/,
    /\b(s'inscrire|sinscrire|inscrire mon|inscription (en tant que|comme) (prestataire|partenaire))\b/,
    /\b(inscrire|inscription)\b.*\b(riserv|prestataire|plateforme)\b/,
    /\b(devenir|etre) (un )?(prestataire|partenaire|professionnel)\b/,
    /\brejoindre riserv\b/,
    /\b(mon|notre) (entreprise|salon|commerce|activite|boutique) sur riserv\b/,
    /\bcreer mon (compte|etablissement|activite)\b/,
    /\bprofessionnel.*\b(rejoindre|riserv)\b/,
    /\bprestataire sur riserv\b/,
    /\binscrire mon (entreprise|salon|activite|commerce)\b/,
    /\bajouter.*\bsur riserv\b/,
    /\bmettre mon (entreprise|salon|commerce|activite)\b/,
    /\benregistrer mon (entreprise|salon|commerce)\b/,
  ];
  return patterns.some((re) => re.test(b));
}

/**
 * Bascule vers parcours prestataire : heuristique puis IA si besoin.
 */
export async function detecterBasculeVersOnboardingPrestataire(body) {
  if (heuristiqueOnboardingPrestataire(body)) {
    console.log('[BASCULE] Heuristique → onboarding prestataire');
    return true;
  }
  const intention = await detecterIntention(body);
  return intention === 'ONBOARDING';
}

function heuristiqueReservationClient(body) {
  if (heuristiqueOnboardingPrestataire(body)) return false;
  const b = normalizeForMatch(body);
  const patterns = [
    /\b(je veux|jaimerais|je souhaite|souhaite)\b.*\b(rdv|rendez-vous|reservation)\b/,
    /\bprendre (un )?(rdv|rendez-vous)\b/,
    /\breserver\b/,
    /\bje suis (la |un )?client\b/,
    /\bannuler (ma |mon |une )?(reservation|rdv|rendez-vous)\b/,
    /\bclient pour (prendre|reserver|un rdv)\b/,
    /\bprendre rendez-vous\b/,
    /\bje veux (un |une )?(rdv|rendez-vous)\b/,
  ];
  return patterns.some((re) => re.test(b));
}

/**
 * Bascule depuis l’onboarding vers réservation client : priorité à l’inscription si le message l’exprime aussi.
 */
export async function detecterBasculeVersReservationClient(body) {
  if (heuristiqueOnboardingPrestataire(body)) return false;
  if (heuristiqueReservationClient(body)) {
    console.log('[BASCULE] Heuristique → réservation client');
    return true;
  }
  const intention = await detecterIntention(body);
  return intention === 'CLIENT';
}
