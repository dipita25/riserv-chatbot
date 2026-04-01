// ================================
// ESTIMATION DE TOKENS IA
// ================================
// Permet d'estimer la consommation de tokens pour les métriques
// sans avoir à parser les réponses de l'API

/**
 * Estime le nombre de tokens consommés par un texte
 * @param {string} texte - Le texte à analyser (prompt + réponse)
 * @returns {number} Nombre estimé de tokens
 * 
 * Règle d'estimation :
 * - OpenAI : ~4 caractères = 1 token
 * - On utilise 3.5 pour avoir une marge de sécurité
 * - Arrondi au supérieur pour ne pas sous-estimer
 */
export function estimerTokens(texte) {
  if (!texte || texte.length === 0) return 0;
  return Math.ceil(texte.length / 3.5);
}

/**
 * Calcule le temps restant en minutes avant renouvellement
 * @param {Date} heureDebut - Heure de début de la période
 * @returns {number} Minutes restantes
 */
export function calculerMinutesRestantes(heureDebut) {
  const maintenant = new Date();
  const debut = new Date(heureDebut);
  const finPeriode = new Date(debut.getTime() + 60 * 60 * 1000); // +1 heure
  
  const diffMs = finPeriode - maintenant;
  const minutes = Math.max(0, Math.ceil(diffMs / (1000 * 60)));
  
  return minutes;
}

/**
 * Formatte une durée en minutes de façon lisible
 * @param {number} minutes - Nombre de minutes
 * @returns {string} "42 minutes" ou "1 heure 15" ou "< 1 minute"
 */
export function formaterDuree(minutes) {
  if (minutes < 1) return "< 1 minute";
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  
  const heures = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (mins === 0) return `${heures} heure${heures > 1 ? 's' : ''}`;
  return `${heures}h${mins}`;
}
