import twilio from 'twilio';
import crypto from 'crypto';

const provider = process.env.WHATSAPP_PROVIDER || 'twilio';

console.log(`[WHATSAPP] Provider configuré: ${provider}`);

// ================================
// CLIENT TWILIO
// ================================
let twilioClient = null;
if (provider === 'twilio') {
  twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );
  console.log(`[WHATSAPP] Client Twilio initialisé`);
}

// ================================
// ENVOI VIA TWILIO (développement)
// ================================
async function envoyerViaTwilio(to, message) {
  const msgId = crypto.randomBytes(4).toString('hex');
  
  try {
    console.log(`[TWILIO ${msgId}] Envoi message à ${to}...`);
    const result = await twilioClient.messages.create({
      from: `whatsapp:${process.env.TWILIO_NUMBER}`,
      to: `whatsapp:${to}`,
      body: message,
    });
    console.log(`[TWILIO ${msgId}] ✅ Envoyé (SID: ${result.sid})`);
    return result;
  } catch (err) {
    console.error(`[TWILIO ${msgId}] ❌ Erreur envoi:`, {
      error: err.message,
      code: err.code,
      to,
      messageLength: message.length,
    });
    throw err;
  }
}

// ================================
// ENVOI VIA GUPSHUP (production)
// ================================
async function envoyerViaGupshup(to, message) {
  const msgId = crypto.randomBytes(4).toString('hex');
  
  try {
    console.log(`[GUPSHUP ${msgId}] Envoi message à ${to}...`);
    
    const response = await fetch('https://api.gupshup.io/sm/api/v1/msg', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'apikey': process.env.GUPSHUP_API_KEY,
      },
      body: new URLSearchParams({
        channel: 'whatsapp',
        source: process.env.GUPSHUP_APP_ID,
        destination: to,
        'src.name': 'Riserv',
        'message': JSON.stringify({
          type: 'text',
          text: message,
        }),
      }),
    });

    const result = await response.json();
    
    if (!response.ok || result.status !== 'submitted') {
      console.error(`[GUPSHUP ${msgId}] ❌ Erreur réponse API:`, {
        status: response.status,
        result,
      });
      throw new Error(`Gupshup API error: ${result.message || response.statusText}`);
    }

    console.log(`[GUPSHUP ${msgId}] ✅ Envoyé (MessageId: ${result.messageId})`);
    return result;
  } catch (err) {
    console.error(`[GUPSHUP ${msgId}] ❌ Erreur envoi:`, {
      error: err.message,
      to,
      messageLength: message.length,
    });
    throw err;
  }
}

// ================================
// ENVOI VIA META (production)
// ================================
async function envoyerViaMeta(to, message) {
  const msgId = crypto.randomBytes(4).toString('hex');
  
  try {
    console.log(`[META ${msgId}] Envoi message à ${to}...`);
    
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${process.env.META_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.META_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: message },
        }),
      }
    );

    const result = await response.json();
    
    if (!response.ok) {
      console.error(`[META ${msgId}] ❌ Erreur réponse API:`, {
        status: response.status,
        result,
      });
      throw new Error(`Meta API error: ${result.error?.message || response.statusText}`);
    }

    console.log(`[META ${msgId}] ✅ Envoyé (MessageId: ${result.messages?.[0]?.id})`);
    return result;
  } catch (err) {
    console.error(`[META ${msgId}] ❌ Erreur envoi:`, {
      error: err.message,
      to,
      messageLength: message.length,
    });
    throw err;
  }
}

// ================================
// INTERFACE PUBLIQUE
// Toujours appeler cette fonction — jamais Twilio, Gupshup ou Meta directement
// ================================
export async function envoyerMessage(to, message) {
  const sendId = crypto.randomBytes(4).toString('hex');
  
  try {
    console.log(`[SEND ${sendId}] Préparation envoi`, {
      to,
      provider,
      messageLength: message.length,
      preview: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
    });

    if (provider === 'gupshup') {
      await envoyerViaGupshup(to, message);
    } else if (provider === 'twilio') {
      await envoyerViaTwilio(to, message);
    } else if (provider === 'meta') {
      await envoyerViaMeta(to, message);
    } else {
      throw new Error(`Provider inconnu: ${provider}`);
    }

    console.log(`[SEND ${sendId}] ✅ Message envoyé avec succès à ${to}`);
  } catch (err) {
    console.error(`[SEND ${sendId}] ❌ ERREUR CRITIQUE envoi à ${to}:`, {
      error: err.message,
      provider,
      stack: err.stack,
    });
    throw err;
  }
}
