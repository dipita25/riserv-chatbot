import { Router } from 'express';
import crypto from 'crypto';
import { router } from '../services/router.js';
import {
  transcrireAudio,
  transcrireAudioUrl,
} from '../services/whisperService.js';
import { verifierAcces } from '../middlewares/verifierAcces.js';
import { getPrestataire } from '../services/supabaseService.js';
import { envoyerMessage } from '../services/whatsappService.js';
import {
  verifierWebhookGupshup,
  verifierSignatureTwilio,
  verifierSignatureMeta,
  verifierRateLimitWebhook,
  loggerTentativeSuspecte,
} from '../middlewares/webhookSecurity.js';

const routerExpress = Router();

// ================================
// WEBHOOK PRINCIPAL — Gupshup, Twilio & Meta
// ================================
routerExpress.post('/webhook', async (req, res) => {
  const requestId = crypto.randomBytes(8).toString('hex');
  
  console.log(`\n[WEBHOOK ${requestId}] ========== NOUVELLE REQUÊTE ==========`);
  console.log(`[WEBHOOK ${requestId}] IP: ${req.ip || req.connection.remoteAddress}`);
  console.log(`[WEBHOOK ${requestId}] User-Agent: ${req.headers['user-agent'] || 'N/A'}`);

  // 1. Rate limiting global au niveau webhook
  const rateLimit = verifierRateLimitWebhook(req);
  if (!rateLimit.autorise) {
    console.warn(`[WEBHOOK ${requestId}] 🚨 BLOQUÉ - Rate limit dépassé`, {
      ip: rateLimit.ip,
      count: rateLimit.count,
    });
    loggerTentativeSuspecte(req, 'rate_limit_webhook', {
      count: rateLimit.count,
      ip: rateLimit.ip,
    });
    return res.status(429).json({ error: 'Too many requests' });
  }

  console.log(`[WEBHOOK ${requestId}] Rate limit OK (${rateLimit.count}/100 par minute)`);

  // 2. Déterminer le provider et vérifier la sécurité
  const provider = process.env.WHATSAPP_PROVIDER || 'gupshup';
  console.log(`[WEBHOOK ${requestId}] Provider configuré: ${provider}`);

  // --- Format Gupshup ---
  if (provider === 'gupshup' && req.body.type && req.body.payload) {
    console.log(`[WEBHOOK ${requestId}] Format détecté: Gupshup`);
    
    // Vérification de sécurité Gupshup
    const verification = verifierWebhookGupshup(req);
    console.log(`[WEBHOOK ${requestId}] Vérification sécurité:`, verification.logs.validations);

    if (!verification.valide) {
      console.error(`[WEBHOOK ${requestId}] 🚨 REJETÉ - ${verification.raison}`, verification.logs);
      loggerTentativeSuspecte(req, verification.raison, verification.logs);
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Répondre immédiatement à Gupshup (< 1 seconde recommandé)
    res.sendStatus(200);

    try {
      const payload = req.body.payload;
      const from = payload.source || payload.sender?.phone;
      const type = payload.type;

      console.log(`[WEBHOOK ${requestId}] Message Gupshup`, {
        from,
        type,
        hasPayload: !!payload.payload,
      });

      if (!from) {
        console.error(`[WEBHOOK ${requestId}] ❌ Expéditeur manquant dans payload`);
        return;
      }

      if (type === 'text') {
        const body = payload.payload?.text || '';
        console.log(`[WEBHOOK ${requestId}] → Routage message texte de ${from}: "${body.substring(0, 50)}${body.length > 50 ? '...' : ''}"`);
        await router(from, body, 0);
      } else if (type === 'audio') {
        const audioUrl = payload.payload?.url;
        console.log(`[WEBHOOK ${requestId}] → Traitement note vocale de ${from}`);
        await traiterNoteVocale(from, audioUrl, null, 'gupshup');
      } else if (type === 'image') {
        const imageUrl = payload.payload?.url;
        console.log(`[WEBHOOK ${requestId}] → Routage image de ${from} (1 média)`);
        await router(from, '', 1); // Traité comme un média
      } else if (type === 'document' || type === 'video') {
        console.log(`[WEBHOOK ${requestId}] → Type non supporté: ${type}`);
        await envoyerMessage(
          from,
          `Je ne peux traiter que les messages texte, images et notes vocales.`
        );
      } else {
        console.warn(`[WEBHOOK ${requestId}] ⚠️ Type de message inconnu: ${type}`);
      }

      console.log(`[WEBHOOK ${requestId}] ✅ Traitement terminé`);
    } catch (err) {
      console.error(`[WEBHOOK ${requestId}] ❌ Erreur traitement webhook Gupshup:`, {
        error: err.message,
        stack: err.stack,
      });
    }
    return;
  }

  // --- Format Twilio ---
  if (req.body.From) {
    console.log(`[WEBHOOK ${requestId}] Format détecté: Twilio`);
    
    // Vérification signature Twilio (si activée)
    if (process.env.TWILIO_AUTH_TOKEN) {
      const verification = verifierSignatureTwilio(req);
      console.log(`[WEBHOOK ${requestId}] Vérification signature Twilio:`, verification.logs.validations);

      if (!verification.valide) {
        console.error(`[WEBHOOK ${requestId}] 🚨 REJETÉ - ${verification.raison}`, verification.logs);
        loggerTentativeSuspecte(req, verification.raison, verification.logs);
        return res.status(403).json({ error: 'Unauthorized' });
      }
    }

    const from = req.body.From?.replace('whatsapp:', '');
    const body = req.body.Body || '';
    const numMedia = parseInt(req.body.NumMedia || '0');

    console.log(`[WEBHOOK ${requestId}] Message Twilio`, {
      from,
      bodyLength: body.length,
      numMedia,
    });

    // Répondre immédiatement à Twilio (obligatoire en moins de 5 secondes)
    res.set('Content-Type', 'text/xml');
    res.send('<Response></Response>');

    // Message audio ?
    if (numMedia > 0 && req.body.MediaContentType0?.startsWith('audio/')) {
      const mediaUrl = req.body.MediaUrl0;
      console.log(`[WEBHOOK ${requestId}] → Traitement note vocale de ${from}`);
      await traiterNoteVocale(from, mediaUrl, null, 'twilio');
    } else {
      console.log(`[WEBHOOK ${requestId}] → Routage message de ${from}`);
      await router(from, body, numMedia);
    }

    console.log(`[WEBHOOK ${requestId}] ✅ Traitement terminé`);
    return;
  }

  // --- Format Meta Cloud API ---
  if (req.body.object === 'whatsapp_business_account') {
    console.log(`[WEBHOOK ${requestId}] Format détecté: Meta`);
    
    // Vérification signature Meta (si activée)
    if (process.env.META_APP_SECRET) {
      const verification = verifierSignatureMeta(req);
      console.log(`[WEBHOOK ${requestId}] Vérification signature Meta:`, verification.logs.validations);

      if (!verification.valide) {
        console.error(`[WEBHOOK ${requestId}] 🚨 REJETÉ - ${verification.raison}`, verification.logs);
        loggerTentativeSuspecte(req, verification.raison, verification.logs);
        return res.status(403).json({ error: 'Unauthorized' });
      }
    }

    res.sendStatus(200);

    try {
      const entry = req.body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const message = value?.messages?.[0];

      if (!message) {
        console.log(`[WEBHOOK ${requestId}] Pas de message dans le payload Meta`);
        return;
      }

      const from = message.from;
      const type = message.type;

      console.log(`[WEBHOOK ${requestId}] Message Meta`, {
        from,
        type,
      });

      if (type === 'text') {
        const body = message.text?.body || '';
        console.log(`[WEBHOOK ${requestId}] → Routage message texte: "${body.substring(0, 50)}${body.length > 50 ? '...' : ''}"`);
        await router(from, body, 0);
      } else if (type === 'audio') {
        const audioId = message.audio?.id;
        console.log(`[WEBHOOK ${requestId}] → Traitement note vocale de ${from}`);
        await traiterNoteVocale(from, null, audioId, 'meta');
      } else if (type === 'image' || type === 'document') {
        console.log(`[WEBHOOK ${requestId}] → Type non supporté: ${type}`);
        await envoyerMessage(
          from,
          `Je ne peux traiter que les messages texte et les notes vocales.`
        );
      } else {
        console.warn(`[WEBHOOK ${requestId}] ⚠️ Type de message inconnu: ${type}`);
      }

      console.log(`[WEBHOOK ${requestId}] ✅ Traitement terminé`);
    } catch (err) {
      console.error(`[WEBHOOK ${requestId}] ❌ Erreur traitement webhook Meta:`, {
        error: err.message,
        stack: err.stack,
      });
    }
    return;
  }

  // Format non reconnu
  console.warn(`[WEBHOOK ${requestId}] ⚠️ Format non reconnu`, {
    hasFrom: !!req.body.From,
    hasObject: !!req.body.object,
    hasType: !!req.body.type,
    hasPayload: !!req.body.payload,
    bodyKeys: Object.keys(req.body),
  });
  loggerTentativeSuspecte(req, 'format_inconnu', { 
    bodyKeys: Object.keys(req.body),
    provider: process.env.WHATSAPP_PROVIDER,
  });
  res.sendStatus(200);
});

// ================================
// VÉRIFICATION WEBHOOK META (GET)
// ================================
routerExpress.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    console.log('Webhook Meta vérifié avec succès');
    res.status(200).send(challenge);
  } else {
    res.status(403).send('Forbidden');
  }
});

// ================================
// TRAITEMENT DES NOTES VOCALES
// ================================
async function traiterNoteVocale(from, mediaUrl, audioId, provider) {
  const audioId_log = crypto.randomBytes(6).toString('hex');
  
  try {
    console.log(`[AUDIO ${audioId_log}] Début traitement note vocale`, {
      from,
      provider,
      hasMediaUrl: !!mediaUrl,
      hasAudioId: !!audioId,
    });

    // Si l'expéditeur est un prestataire, vérifier son plan
    const prestataire = await getPrestataire(from);

    if (prestataire) {
      console.log(`[AUDIO ${audioId_log}] Expéditeur identifié: prestataire`, {
        nom: prestataire.nom,
        plan: prestataire.plan,
        statut: prestataire.statut_abonnement,
      });

      // Bypass pour l'admin
      const adminPhone = process.env.ADMIN_PHONE;
      const estAdmin = adminPhone && from === adminPhone;

      if (!estAdmin) {
        const acces = await verifierAcces(prestataire, 'notes_vocales');
        console.log(`[AUDIO ${audioId_log}] Vérification accès notes vocales:`, {
          autorise: acces.autorise,
          raison: acces.raison || 'N/A',
        });

        if (!acces.autorise) {
          console.log(`[AUDIO ${audioId_log}] ⛔ Accès refusé - Message envoyé à ${from}`);
          await envoyerMessage(
            from,
            `Les messages vocaux ne sont pas disponibles avec votre abonnement actuel.\n\n` +
              acces.message
          );
          return;
        }
      } else {
        console.log(`[AUDIO ${audioId_log}] Admin détecté - Bypass accès`);
      }
    } else {
      console.log(`[AUDIO ${audioId_log}] Expéditeur identifié: client ou onboarding`);
    }

    // Transcrire selon le provider
    let transcription = '';

    console.log(`[AUDIO ${audioId_log}] Début transcription via ${provider}`);

    if (provider === 'meta' && audioId) {
      transcription = await transcrireAudio(audioId);
    } else if (provider === 'twilio' && mediaUrl) {
      transcription = await transcrireAudioUrl(mediaUrl);
    } else if (provider === 'gupshup' && mediaUrl) {
      transcription = await transcrireAudioUrl(mediaUrl);
    }

    if (!transcription) {
      console.error(`[AUDIO ${audioId_log}] ❌ Transcription échouée ou vide`);
      await envoyerMessage(
        from,
        `Je n'ai pas pu comprendre votre message vocal. ` +
          `Pouvez-vous écrire votre demande ?`
      );
      return;
    }

    console.log(`[AUDIO ${audioId_log}] ✅ Transcription réussie: "${transcription.substring(0, 100)}${transcription.length > 100 ? '...' : ''}"`);

    // Router la transcription comme un message texte normal
    await router(from, transcription, 0);
    console.log(`[AUDIO ${audioId_log}] ✅ Routage terminé`);
  } catch (err) {
    console.error(`[AUDIO ${audioId_log}] ❌ Erreur traitement note vocale:`, {
      error: err.message,
      stack: err.stack,
      from,
      provider,
    });
    await envoyerMessage(
      from,
      `Une erreur s'est produite avec votre message vocal. ` +
        `Pouvez-vous écrire votre demande ?`
    );
  }
}

// ================================
// ROUTES DE DÉVELOPPEMENT
// ================================
if (process.env.NODE_ENV === 'development') {
  // Simuler un message texte
  routerExpress.post('/simulate', async (req, res) => {
    const { from, body } = req.body;
    if (!from || !body) {
      return res
        .status(400)
        .json({ error: 'Les champs "from" et "body" sont requis' });
    }
    console.log(`[SIMULATION] Message de ${from} : "${body}"`);
    res.json({ status: 'ok', message: 'Simulation lancée' });
    await router(from, body, 0);
  });

  // Simuler une note vocale (transcription déjà faite)
  routerExpress.post('/simulate/audio', async (req, res) => {
    const { from, transcription } = req.body;
    if (!from || !transcription) {
      return res
        .status(400)
        .json({ error: 'Les champs "from" et "transcription" sont requis' });
    }
    console.log(`[SIMULATION AUDIO] Message de ${from} : "${transcription}"`);
    res.json({ status: 'ok', message: 'Simulation audio lancée' });
    await router(from, transcription, 0);
  });

  // Déclencher les cron jobs manuellement
  routerExpress.post('/test/rappels', async (req, res) => {
    res.json({ status: 'ok', message: 'Rappels J-1 lancés' });
    const { envoyerRappelsJMoinsUn } = await import('../services/cronJobs.js');
    await envoyerRappelsJMoinsUn();
  });

  routerExpress.post('/test/suspensions', async (req, res) => {
    res.json({ status: 'ok', message: 'Vérification suspensions lancée' });
    const { suspendreAbonnementsExpires } =
      await import('../services/cronJobs.js');
    await suspendreAbonnementsExpires();
  });

  routerExpress.post('/test/alertes', async (req, res) => {
    res.json({ status: 'ok', message: 'Alertes expiration lancées' });
    const { alerterExpirationImminente } =
      await import('../services/cronJobs.js');
    await alerterExpirationImminente();
  });

  routerExpress.post('/test/rapport-starter-veille', async (req, res) => {
    res.json({ status: 'ok', message: 'Rapport Starter (blocages 18h) lancé' });
    const { envoyerRapportStarterBlocagesVeille } =
      await import('../services/cronJobs.js');
    await envoyerRapportStarterBlocagesVeille();
  });
}

export default routerExpress;
