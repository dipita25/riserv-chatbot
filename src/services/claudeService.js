import Anthropic from '@anthropic-ai/sdk';
import { getConversation, sauvegarderConversation } from './supabaseService.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Nombre maximum de messages gardés en mémoire par conversation
// Au-delà, les plus anciens sont supprimés pour économiser les tokens
const MAX_MESSAGES = 20;

export async function envoyerMessageClaude(
  telephone,
  role,
  prestataireId,
  systemPrompt,
  nouveauMessage
) {
  // 1. Récupérer l'historique de la conversation depuis Supabase
  const conversation = await getConversation(telephone);
  let messages = conversation?.messages || [];

  // 2. Ajouter le nouveau message de l'utilisateur
  messages.push({
    role: 'user',
    content: nouveauMessage,
  });

  // 3. Limiter la taille de l'historique
  if (messages.length > MAX_MESSAGES) {
    messages = messages.slice(messages.length - MAX_MESSAGES);
  }

  // 4. Appeler Claude
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20251001',
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  });

  const reponse = response.content[0].text;

  // 5. Ajouter la réponse de Claude à l'historique
  messages.push({
    role: 'assistant',
    content: reponse,
  });

  // 6. Sauvegarder la conversation mise à jour dans Supabase
  await sauvegarderConversation(telephone, role, prestataireId, messages);

  return reponse;
}

// Détection d'intention pour les numéros inconnus
export async function detecterIntention(message) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20251001',
    max_tokens: 10,
    messages: [
      {
        role: 'user',
        content: `Analyse ce message et réponds UNIQUEMENT par un mot parmi : ONBOARDING, CLIENT, INCONNU.

ONBOARDING = la personne veut s'inscrire comme prestataire de service sur une plateforme de réservation
CLIENT = la personne veut réserver un service
INCONNU = impossible de déterminer

Message : "${message}"`,
      },
    ],
  });

  const intention = response.content[0].text.trim().toUpperCase();

  if (['ONBOARDING', 'CLIENT', 'INCONNU'].includes(intention)) {
    return intention;
  }

  return 'INCONNU';
}
