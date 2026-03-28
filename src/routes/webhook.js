import { Router } from 'express';
import { router } from '../services/router.js';

const routerExpress = Router();

// Webhook Twilio — reçoit les messages WhatsApp entrants
routerExpress.post('/webhook', async (req, res) => {
  const from = req.body.From?.replace('whatsapp:', '');
  const body = req.body.Body || '';
  const numMedia = parseInt(req.body.NumMedia || '0');

  // Répondre immédiatement à Twilio (obligatoire en moins de 5 secondes)
  // Le traitement se fait en arrière-plan
  res.set('Content-Type', 'text/xml');
  res.send('<Response></Response>');

  // Traitement du message en arrière-plan
  await router(from, body, numMedia);
});

// Route de simulation — développement uniquement
if (process.env.NODE_ENV === 'development') {
  routerExpress.post('/simulate', async (req, res) => {
    const { from, body } = req.body;

    if (!from || !body) {
      return res
        .status(400)
        .json({ error: 'Les champs "from" et "body" sont requis' });
    }

    console.log(`[SIMULATION] Message de ${from} : "${body}"`);

    res.json({ status: 'ok', message: 'Simulation lancée' });

    // Traitement du message
    await router(from, body, 0);
  });
}

// Routes de test cron — développement uniquement
if (process.env.NODE_ENV === 'development') {
  // ... routes simulate existantes ...

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
}

export default routerExpress;
