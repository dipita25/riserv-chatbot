import 'dotenv/config';
import express from 'express';
import cron from 'node-cron';
import supabase from './services/supabaseService.js';
import webhookRouter from './routes/webhook.js';
import {
  envoyerRappelsJMoinsUn,
  suspendreAbonnementsExpires,
  alerterExpirationImminente,
} from './services/cronJobs.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/', webhookRouter);

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    project: 'Riserv',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ================================
// CRON JOBS
// ================================
function demarrerCronJobs() {
  // Rappels J-1 — chaque soir à 20h00 (heure Maurice = UTC+4)
  // En UTC : 16h00
  cron.schedule(
    '0 16 * * *',
    async () => {
      await envoyerRappelsJMoinsUn();
    },
    { timezone: 'Indian/Mauritius' }
  );

  // Suspension abonnements expirés — chaque nuit à minuit
  cron.schedule(
    '0 0 * * *',
    async () => {
      await suspendreAbonnementsExpires();
    },
    { timezone: 'Indian/Mauritius' }
  );

  // Alertes expiration imminente — chaque matin à 9h
  cron.schedule(
    '0 9 * * *',
    async () => {
      await alerterExpirationImminente();
    },
    { timezone: 'Indian/Mauritius' }
  );

  console.log('Cron jobs démarrés :');
  console.log('  - Rappels J-1      : chaque jour à 20h00 (Maurice)');
  console.log('  - Suspension       : chaque jour à minuit (Maurice)');
  console.log('  - Alertes exp.     : chaque jour à 09h00 (Maurice)');
}

// ================================
// TEST DE CONNEXION SUPABASE
// ================================
async function testerConnexion() {
  try {
    const { data, error } = await supabase.from('prestataires').select('count');

    if (error) throw error;
    console.log('Supabase connecté avec succès');
  } catch (err) {
    console.error('Erreur connexion Supabase :', err.message);
    process.exit(1);
  }
}

// Capturer les erreurs non gérées pour éviter que le serveur crash
process.on('uncaughtException', err => {
  console.error('Erreur non gérée :', err);
});

process.on('unhandledRejection', reason => {
  console.error('Promise rejetée non gérée :', reason);
});

// ================================
// DÉMARRAGE
// ================================
testerConnexion().then(() => {
  app.listen(PORT, () => {
    console.log(`\nRiserv démarré sur le port ${PORT}`);
    console.log(`Environnement : ${process.env.NODE_ENV}`);
    console.log(`Health check  : http://localhost:${PORT}/health\n`);
  });

  demarrerCronJobs();
});
