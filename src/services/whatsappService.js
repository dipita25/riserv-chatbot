import twilio from 'twilio';

const provider = process.env.WHATSAPP_PROVIDER || 'twilio';

// ================================
// CLIENT TWILIO
// ================================
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// ================================
// ENVOI VIA TWILIO (développement)
// ================================
async function envoyerViaTwilio(to, message) {
  await twilioClient.messages.create({
    from: `whatsapp:${process.env.TWILIO_NUMBER}`,
    to: `whatsapp:${to}`,
    body: message,
  });
}

// ================================
// ENVOI VIA META (production)
// ================================
async function envoyerViaMeta(to, message) {
  await fetch(
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
}

// ================================
// INTERFACE PUBLIQUE
// Toujours appeler cette fonction — jamais Twilio ou Meta directement
// ================================
export async function envoyerMessage(to, message) {
  try {
    if (provider === 'twilio') {
      await envoyerViaTwilio(to, message);
    } else {
      await envoyerViaMeta(to, message);
    }
    console.log(`Message envoyé à ${to} : "${message.substring(0, 50)}..."`);
  } catch (err) {
    console.error(`Erreur envoi message à ${to} :`, err.message);
    throw err;
  }
}
