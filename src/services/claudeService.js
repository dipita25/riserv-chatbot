import OpenAI from 'openai';
import crypto from 'crypto';
import { getConversation, sauvegarderConversation } from './supabaseService.js';

const AI_PROVIDER = process.env.AI_PROVIDER || 'openai';
const MAX_MESSAGES = 20;

console.log(`[IA] Provider configuré: ${AI_PROVIDER}`);

// ================================
// PRÉNOMS ALÉATOIRES
// ================================
const PRENOMS_FEMININS = [
  'Priya',
  'Nadia',
  'Laetitia',
  'Anisha',
  'Céline',
  'Kavya',
  'Sandrine',
  'Meena',
  'Christelle',
  'Divya',
  'Pooja',
  'Vanessa',
  'Shreya',
  'Isabelle',
  'Asha',
  'Mélanie',
  'Roshni',
  'Audrey',
  'Sunita',
  'Manon',
  'Parveen',
  'Sophie',
  'Lakshmi',
  'Elodie',
  'Nisha',
  'Camille',
  'Deepa',
  'Stéphanie',
  'Rina',
  'Charlène',
  'Geeta',
  'Lucie',
  'Anita',
  'Corinne',
  'Sanjana',
  'Émilie',
  'Kavita',
  'Nadège',
  'Usha',
  'Floriane',
  'Sarita',
  'Amélie',
  'Rekha',
  'Jennifer',
  'Leena',
  'Ornella',
  'Varsha',
  'Cindy',
  'Padma',
  'Anaïs',
  'Seema',
  'Déborah',
  'Pushpa',
  'Morgane',
  'Smita',
  'Axelle',
  'Chandra',
  'Gwenaëlle',
  'Lata',
  'Inès',
  'Tina',
];

const PRENOMS_MASCULINS = [
  'Kevin',
  'Roshan',
  'Damien',
  'Vikash',
  'Stéphane',
  'Arjun',
  'Loïc',
  'Dinesh',
  'Fabrice',
  'Yash',
  'Mathieu',
  'Rajesh',
  'Nicolas',
  'Suresh',
  'Dorian',
  'Kavin',
  'Florent',
  'Anil',
  'Sébastien',
  'Ravi',
  'Bryan',
  'Pravin',
  'Julien',
  'Ashwin',
  'Dylan',
  'Nitin',
  'Kévin',
  'Mahesh',
  'Cédric',
  'Sanjeev',
  'Antoine',
  'Vishal',
  'Samuel',
  'Deepak',
  'Mickaël',
  'Girish',
  'Axel',
  'Navin',
  'Joël',
  'Vijay',
  'Raphaël',
  'Sachin',
  'Guillaume',
  'Hitesh',
  'Warren',
  'Yogesh',
  'Éric',
  'Ramesh',
  'Thierry',
  'Devesh',
  'Brendan',
  'Kiran',
  'Patrick',
  'Omkar',
  'Clément',
  'Neeraj',
  'Rodrigue',
  'Sanjay',
  'Harold',
  'Pravesh',
];

const TOUS_PRENOMS = [...PRENOMS_FEMININS, ...PRENOMS_MASCULINS];

function getPrenomAleatoire() {
  return TOUS_PRENOMS[Math.floor(Math.random() * TOUS_PRENOMS.length)];
}

function getPrenomConversation(messages) {
  const msg = messages.find(
    m => m.role === 'system' && m.content?.startsWith('PRENOM_AGENT:')
  );
  if (msg) return msg.content.replace('PRENOM_AGENT:', '').trim();
  return null;
}

// ================================
// CLIENT IA
// ================================
const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function appellerIA(systemPrompt, messages, maxTokens = 1024) {
  const callId = crypto.randomBytes(4).toString('hex');
  
  try {
    console.log(`[IA ${callId}] Appel ${AI_PROVIDER}`, {
      provider: AI_PROVIDER,
      messagesCount: messages.length,
      maxTokens,
      systemPromptLength: systemPrompt.length,
    });

    if (AI_PROVIDER === 'openai') {
      const response = await openaiClient.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: maxTokens,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
      });
      
      const reponse = response.choices[0].message.content;
      
      console.log(`[IA ${callId}] ✅ Réponse OpenAI reçue`, {
        tokensPrompt: response.usage?.prompt_tokens,
        tokensCompletion: response.usage?.completion_tokens,
        tokensTotal: response.usage?.total_tokens,
        responseLength: reponse.length,
        finishReason: response.choices[0].finish_reason,
      });
      
      return reponse;
    }

    if (AI_PROVIDER === 'claude') {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20251001',
        max_tokens: maxTokens,
        system: systemPrompt,
        messages,
      });
      
      const reponse = response.content[0].text;
      
      console.log(`[IA ${callId}] ✅ Réponse Claude reçue`, {
        tokensInput: response.usage?.input_tokens,
        tokensOutput: response.usage?.output_tokens,
        responseLength: reponse.length,
        stopReason: response.stop_reason,
      });
      
      return reponse;
    }

    throw new Error(`Provider IA non supporté : ${AI_PROVIDER}`);
    
  } catch (err) {
    console.error(`[IA ${callId}] ❌ ERREUR appel IA:`, {
      error: err.message,
      provider: AI_PROVIDER,
      messagesCount: messages.length,
      stack: err.stack,
    });
    throw err;
  }
}

// ================================
// FILTRE HORS-SUJET
// ================================
export async function estMessagePertinent(message) {
  const checkId = crypto.randomBytes(3).toString('hex');
  
  if (message.trim().length <= 4) {
    console.log(`[IA-PERTINENCE ${checkId}] Message trop court, considéré pertinent par défaut`);
    return true;
  }

  try {
    console.log(`[IA-PERTINENCE ${checkId}] Analyse pertinence: "${message.substring(0, 50)}..."`);
    
    const reponse = await appellerIA(
      `Tu analyses des messages WhatsApp pour un service de réservation de rendez-vous.
Un message est PERTINENT s'il concerne : prendre rendez-vous, annuler, choisir un service ou créneau, confirmer, les horaires, les services disponibles, la gestion d'agenda, un problème technique avec la plateforme, ou une réclamation.
Un message est HORS_SUJET s'il n'a aucun rapport avec ces sujets.
Réponds UNIQUEMENT par : PERTINENT ou HORS_SUJET`,
      [{ role: 'user', content: message }],
      10
    );

    const resultat = reponse.trim().toUpperCase() === 'PERTINENT';
    console.log(`[IA-PERTINENCE ${checkId}] → Résultat: ${resultat ? 'PERTINENT' : 'HORS_SUJET'}`);
    
    return resultat;
  } catch (err) {
    console.error(`[IA-PERTINENCE ${checkId}] ❌ Erreur analyse:`, err.message);
    // En cas d'erreur, considérer pertinent par défaut
    return true;
  }
}

// ================================
// DÉTECTION DE SIGNALEMENT
// ================================
export async function detecterSignalement(message, contexte) {
  const signalId = crypto.randomBytes(3).toString('hex');
  
  try {
    console.log(`[IA-SIGNALEMENT ${signalId}] Analyse signalement: "${message.substring(0, 50)}..."`);
    
    const reponse = await appellerIA(
      `Tu analyses un message WhatsApp pour détecter si l'utilisateur signale un problème technique ou une réclamation concernant la plateforme Riserv.

Réponds UNIQUEMENT en JSON :
{
  "est_signalement": true/false,
  "certitude": "haute"/"moyenne"/"faible",
  "type": "bug_technique"/"probleme_reservation"/"probleme_paiement"/"autre",
  "description_extraite": "description brève du problème si détectée, sinon null"
}

Exemples de signalements : "ça ne marche pas", "j'ai un problème", "mon RDV n'apparaît pas", "le bot ne répond plus", "j'ai payé mais mon compte n'est pas activé".`,
      [{ role: 'user', content: message }],
      200
    );

    try {
      const nettoye = reponse.replace(/```json|```/g, '').trim();
      const resultat = JSON.parse(nettoye);
      
      console.log(`[IA-SIGNALEMENT ${signalId}] → Résultat:`, {
        estSignalement: resultat.est_signalement,
        type: resultat.type,
        certitude: resultat.certitude,
      });
      
      return resultat;
    } catch {
      console.warn(`[IA-SIGNALEMENT ${signalId}] ⚠️ Parsing JSON échoué, pas de signalement`);
      return { est_signalement: false };
    }
  } catch (err) {
    console.error(`[IA-SIGNALEMENT ${signalId}] ❌ Erreur détection:`, err.message);
    return { est_signalement: false };
  }
}

// ================================
// ENVOYER UN MESSAGE ET MAINTENIR LE CONTEXTE
// ================================
export async function envoyerMessageClaude(
  telephone,
  role,
  prestataireId,
  systemPrompt,
  nouveauMessage
) {
  const convId = crypto.randomBytes(4).toString('hex');
  
  try {
    console.log(`[IA-CONV ${convId}] Début conversation`, {
      telephone,
      role,
      prestataireId,
      messageLength: nouveauMessage.length,
    });

    const conversation = await getConversation(telephone);
    let messages = conversation?.messages || [];
    
    console.log(`[IA-CONV ${convId}] Historique chargé: ${messages.length} messages`);

    let prenomAgent = getPrenomConversation(messages);
    if (!prenomAgent) {
      prenomAgent = getPrenomAleatoire();
      console.log(`[IA-CONV ${convId}] Nouveau prénom agent: ${prenomAgent}`);
      messages.push({
        role: 'system',
        content: `PRENOM_AGENT:${prenomAgent}`,
      });
    } else {
      console.log(`[IA-CONV ${convId}] Prénom agent existant: ${prenomAgent}`);
    }

    const systemPromptAvecPrenom =
      systemPrompt +
      `\n\nIDENTITÉ : Tu t'appelles ${prenomAgent}. Tu travailles au service client de Riserv. ` +
      `Présente-toi par ce prénom quand c'est naturel. Ne mentionne jamais que tu es une IA.`;

    const messagesIA = messages.filter(m => m.role !== 'system');
    messagesIA.push({ role: 'user', content: nouveauMessage });

    if (messagesIA.length > MAX_MESSAGES) {
      const removed = messagesIA.length - MAX_MESSAGES;
      messagesIA.splice(0, removed);
      console.log(`[IA-CONV ${convId}] Historique tronqué: ${removed} messages supprimés`);
    }

    console.log(`[IA-CONV ${convId}] Appel IA avec ${messagesIA.length} messages...`);
    const reponse = await appellerIA(systemPromptAvecPrenom, messagesIA);
    
    console.log(`[IA-CONV ${convId}] ✅ Réponse générée (${reponse.length} caractères)`);

    messages.push({ role: 'user', content: nouveauMessage });
    messages.push({ role: 'assistant', content: reponse });

    await sauvegarderConversation(telephone, role, prestataireId, messages);
    console.log(`[IA-CONV ${convId}] Conversation sauvegardée`);

    return reponse;
  } catch (err) {
    console.error(`[IA-CONV ${convId}] ❌ ERREUR conversation:`, {
      error: err.message,
      telephone,
      role,
      stack: err.stack,
    });
    throw err;
  }
}

// ================================
// DÉTECTER L'INTENTION
// ================================
export async function detecterIntention(message) {
  const intentId = crypto.randomBytes(3).toString('hex');
  
  try {
    console.log(`[IA-INTENTION ${intentId}] Détection intention pour: "${message.substring(0, 50)}..."`);
    
    const reponse = await appellerIA(
      `Tu analyses des messages WhatsApp pour déterminer l'intention.
Réponds UNIQUEMENT par un seul mot parmi ces options :
- ONBOARDING : la personne veut s'inscrire comme prestataire de service
- CLIENT : la personne veut réserver un service
- SIGNALEMENT : la personne signale un problème technique ou une réclamation
- INCONNU : impossible à déterminer

Aucun autre mot, aucune ponctuation, aucune explication.`,
      [{ role: 'user', content: message }],
      10
    );

    const intention = reponse.trim().toUpperCase();
    
    if (['ONBOARDING', 'CLIENT', 'SIGNALEMENT', 'INCONNU'].includes(intention)) {
      console.log(`[IA-INTENTION ${intentId}] ✅ Intention détectée: ${intention}`);
      return intention;
    }
    
    console.warn(`[IA-INTENTION ${intentId}] ⚠️ Intention non reconnue: "${reponse}", par défaut: INCONNU`);
    return 'INCONNU';
  } catch (err) {
    console.error(`[IA-INTENTION ${intentId}] ❌ Erreur détection:`, err.message);
    return 'INCONNU';
  }
}

// ================================
// APPEL IA DIRECT (pour adminHandler)
// ================================
export async function appellerIADirect(systemPrompt, message) {
  const directId = crypto.randomBytes(3).toString('hex');
  console.log(`[IA-DIRECT ${directId}] Appel direct pour admin/autres handlers`);
  return await appellerIA(systemPrompt, [{ role: 'user', content: message }]);
}
