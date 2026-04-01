import crypto from 'crypto';

// ================================
// SÉCURITÉ WEBHOOK - MULTICOUCHE
// ================================

/**
 * Vérifie qu'une requête provient bien de Gupshup
 * Basé sur les pratiques de sécurité recommandées par Gupshup
 */
export function verifierWebhookGupshup(req) {
  const logs = {
    timestamp: new Date().toISOString(),
    ip: req.ip || req.connection.remoteAddress,
    headers: {},
    validations: {},
  };

  try {
    // 1. Vérifier le token secret dans les headers (si configuré)
    const gupshupToken = process.env.GUPSHUP_WEBHOOK_TOKEN;
    if (gupshupToken) {
      const receivedToken = req.headers['x-gupshup-token'] || req.headers['authorization'];
      
      logs.headers.tokenPresent = !!receivedToken;
      logs.validations.tokenValid = receivedToken === gupshupToken || receivedToken === `Bearer ${gupshupToken}`;

      if (!logs.validations.tokenValid) {
        logs.error = 'Token invalide ou manquant';
        return { valide: false, raison: 'token_invalide', logs };
      }
    }

    // 2. Vérifier le User-Agent Gupshup
    const userAgent = req.headers['user-agent'] || '';
    logs.headers.userAgent = userAgent;
    
    const isGupshupUserAgent = 
      userAgent.toLowerCase().includes('gupshup') ||
      userAgent.toLowerCase().includes('whatsapp') ||
      userAgent === ''; // Gupshup peut ne pas toujours envoyer de User-Agent

    logs.validations.userAgentValid = isGupshupUserAgent;

    // 3. Vérifier IP whitelisting (si configuré)
    const ipsAutorisees = process.env.GUPSHUP_ALLOWED_IPS?.split(',').map(ip => ip.trim());
    if (ipsAutorisees && ipsAutorisees.length > 0 && ipsAutorisees[0] !== '') {
      const ipClient = req.ip || req.connection.remoteAddress || '';
      const ipNormalisee = ipClient.replace('::ffff:', ''); // Normaliser IPv6
      
      logs.validations.ipWhitelisted = ipsAutorisees.includes(ipNormalisee);
      
      if (!logs.validations.ipWhitelisted) {
        logs.error = `IP non autorisée : ${ipNormalisee}`;
        return { valide: false, raison: 'ip_non_autorisee', logs };
      }
    }

    // 4. Vérifier la structure du payload Gupshup
    const payload = req.body;
    logs.payload = {
      hasType: !!payload.type,
      hasPayload: !!payload.payload,
      type: payload.type,
    };

    // Format Gupshup standard
    const isGupshupFormat = 
      payload.type && // 'message', 'message-event', etc.
      payload.payload && // Contenu du message
      typeof payload.payload === 'object';

    logs.validations.formatValid = isGupshupFormat;

    if (!isGupshupFormat) {
      logs.error = 'Format de payload invalide (pas Gupshup)';
      return { valide: false, raison: 'format_invalide', logs };
    }

    // 5. Vérifier que le payload contient les champs requis
    const payloadData = payload.payload;
    const hasRequiredFields = 
      payloadData.source || // Numéro expéditeur
      payloadData.sender || // Alternative
      (payloadData.type && (payloadData.type === 'text' || payloadData.type === 'audio' || payloadData.type === 'image'));

    logs.validations.requiredFieldsPresent = hasRequiredFields;

    if (!hasRequiredFields) {
      logs.error = 'Champs requis manquants dans payload';
      return { valide: false, raison: 'champs_manquants', logs };
    }

    // Toutes les vérifications passées
    logs.validations.global = 'VALIDE';
    return { valide: true, logs };

  } catch (err) {
    logs.error = err.message;
    logs.validations.global = 'ERREUR';
    return { valide: false, raison: 'erreur_verification', logs };
  }
}

/**
 * Vérifie la signature Twilio (HMAC-SHA1)
 */
export function verifierSignatureTwilio(req) {
  const logs = {
    timestamp: new Date().toISOString(),
    provider: 'twilio',
    validations: {},
  };

  try {
    const signature = req.headers['x-twilio-signature'];
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    logs.headers = {
      signaturePresent: !!signature,
      url: url,
    };

    if (!signature || !authToken) {
      logs.error = 'Signature ou auth token manquant';
      return { valide: false, raison: 'signature_manquante', logs };
    }

    const params = Object.keys(req.body)
      .sort()
      .reduce((acc, key) => acc + key + req.body[key], url);

    const hmac = crypto
      .createHmac('sha1', authToken)
      .update(Buffer.from(params, 'utf-8'))
      .digest('base64');

    logs.validations.signatureValid = hmac === signature;

    if (hmac !== signature) {
      logs.error = 'Signature invalide';
      return { valide: false, raison: 'signature_invalide', logs };
    }

    logs.validations.global = 'VALIDE';
    return { valide: true, logs };

  } catch (err) {
    logs.error = err.message;
    logs.validations.global = 'ERREUR';
    return { valide: false, raison: 'erreur_verification', logs };
  }
}

/**
 * Vérifie la signature Meta (SHA256)
 */
export function verifierSignatureMeta(req) {
  const logs = {
    timestamp: new Date().toISOString(),
    provider: 'meta',
    validations: {},
  };

  try {
    const signature = req.headers['x-hub-signature-256'];
    const appSecret = process.env.META_APP_SECRET;

    logs.headers = {
      signaturePresent: !!signature,
    };

    if (!signature || !appSecret) {
      logs.error = 'Signature ou app secret manquant';
      return { valide: false, raison: 'signature_manquante', logs };
    }

    const expectedSignature = 'sha256=' + crypto
      .createHmac('sha256', appSecret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    logs.validations.signatureValid = signature === expectedSignature;

    if (signature !== expectedSignature) {
      logs.error = 'Signature invalide';
      return { valide: false, raison: 'signature_invalide', logs };
    }

    logs.validations.global = 'VALIDE';
    return { valide: true, logs };

  } catch (err) {
    logs.error = err.message;
    logs.validations.global = 'ERREUR';
    return { valide: false, raison: 'erreur_verification', logs };
  }
}

/**
 * Rate limiting au niveau webhook pour éviter les attaques DDoS
 */
const webhookAttempts = new Map();
const MAX_ATTEMPTS_PER_MINUTE = 100;
const CLEANUP_INTERVAL = 60000; // 1 minute

// Nettoyer périodiquement
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of webhookAttempts.entries()) {
    if (now - data.firstAttempt > 60000) {
      webhookAttempts.delete(ip);
    }
  }
}, CLEANUP_INTERVAL);

export function verifierRateLimitWebhook(req) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();

  if (!webhookAttempts.has(ip)) {
    webhookAttempts.set(ip, {
      count: 1,
      firstAttempt: now,
    });
    return { autorise: true, ip, count: 1 };
  }

  const data = webhookAttempts.get(ip);
  
  // Réinitialiser si plus d'1 minute
  if (now - data.firstAttempt > 60000) {
    webhookAttempts.set(ip, {
      count: 1,
      firstAttempt: now,
    });
    return { autorise: true, ip, count: 1 };
  }

  // Incrémenter
  data.count++;

  if (data.count > MAX_ATTEMPTS_PER_MINUTE) {
    return { 
      autorise: false, 
      ip, 
      count: data.count,
      raison: 'rate_limit_webhook_depasse'
    };
  }

  return { autorise: true, ip, count: data.count };
}

/**
 * Logger les tentatives suspectes
 */
export function loggerTentativeSuspecte(req, raison, details = {}) {
  const log = {
    timestamp: new Date().toISOString(),
    type: 'TENTATIVE_SUSPECTE',
    ip: req.ip || req.connection.remoteAddress,
    method: req.method,
    path: req.path,
    headers: {
      userAgent: req.headers['user-agent'],
      contentType: req.headers['content-type'],
      origin: req.headers['origin'],
    },
    raison,
    details,
  };

  console.warn('[SÉCURITÉ]', JSON.stringify(log, null, 2));

  // Envoyer alerte admin si trop de tentatives
  if (details.count && details.count > 50) {
    notifierAdminTentativeSuspecte(log);
  }
}

async function notifierAdminTentativeSuspecte(log) {
  try {
    const adminPhone = process.env.ADMIN_PHONE;
    if (adminPhone) {
      const { envoyerMessage } = await import('../services/whatsappService.js');
      await envoyerMessage(
        adminPhone,
        `🚨 *ALERTE SÉCURITÉ*\n\n` +
        `Tentatives suspectes détectées :\n` +
        `IP : ${log.ip}\n` +
        `Raison : ${log.raison}\n` +
        `Compteur : ${log.details.count || 'N/A'}\n` +
        `Heure : ${new Date(log.timestamp).toLocaleString('fr-FR', { timeZone: 'Indian/Mauritius' })}`
      );
    }
  } catch (err) {
    console.error('[SÉCURITÉ] Erreur notification admin:', err.message);
  }
}
