import { detecterSignalement } from './claudeService.js';
import { handleSignalement } from './signalementHandler.js';

const CERTITUDES_SIGNALEMENT = new Set(['haute', 'moyenne']);

/**
 * Détecte et enregistre un signalement avant tout autre traitement (réservation, agenda, etc.).
 * À appeler dès que le contexte conversation est disponible.
 *
 * @returns {Promise<boolean>} true si un signalement a été traité (le flux doit s'arrêter)
 */
export async function traiterSignalementPrioritaire(from, body, contexte, emetteurType) {
  const texte = (body || '').trim();
  if (texte.length < 3) return false;

  console.log(`[SIGNALEMENT-PRIORITAIRE] Vérification pour ${emetteurType}...`);
  const analyse = await detecterSignalement(texte, Array.isArray(contexte) ? contexte : []);
  const cert = String(analyse.certitude || '').toLowerCase();

  if (
    analyse.est_signalement &&
    CERTITUDES_SIGNALEMENT.has(cert)
  ) {
    console.log(`[SIGNALEMENT-PRIORITAIRE] → Signalement (${cert}), traitement`);
    await handleSignalement(from, texte, emetteurType, {
      description: analyse.description_extraite || texte,
      type: analyse.type || 'autre',
    });
    return true;
  }

  return false;
}
