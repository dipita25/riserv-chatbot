import {
  getReservationsDemain,
  getPrestatairesExpires,
  getPrestatairesExpirantBientot,
  suspendrePrestataire,
  notificationDejaEnvoyee,
  enregistrerNotification,
} from './supabaseService.js';
import { envoyerMessage } from './whatsappService.js';
import { formaterDate } from '../utils/dateUtils.js';

// ================================
// CRON 1 — RAPPELS J-1
// Tourne chaque soir à 20h00
// ================================
export async function envoyerRappelsJMoinsUn() {
  console.log(`[CRON] Rappels J-1 — démarrage ${new Date().toISOString()}`);

  const reservations = await getReservationsDemain();
  console.log(
    `[CRON] ${reservations.length} réservation(s) trouvée(s) pour demain`
  );

  let envoyes = 0;
  let ignores = 0;

  for (const reservation of reservations) {
    try {
      // Éviter d'envoyer deux fois le même rappel
      const dejaEnvoye = await notificationDejaEnvoyee(
        reservation.id,
        'rappel_rdv'
      );
      if (dejaEnvoye) {
        ignores++;
        continue;
      }

      const { clients, services, prestataires, date, heure } = reservation;

      // Rappel au client
      const messageClient =
        `⏰ Rappel : vous avez un rendez-vous demain !\n\n` +
        `Service : ${services.nom}\n` +
        `Heure : ${heure.substring(0, 5)}\n` +
        `Chez : ${prestataires.nom}\n\n` +
        `Pour annuler, répondez ANNULER.`;

      await envoyerMessage(clients.telephone, messageClient);
      await enregistrerNotification({
        reservation_id: reservation.id,
        destinataire_telephone: clients.telephone,
        destinataire_type: 'client',
        type: 'rappel_rdv',
        statut: 'envoye',
        contenu: messageClient,
        envoye_a: new Date().toISOString(),
      });

      // Rappel au prestataire
      const messagePrestataire =
        `⏰ Rappel RDV demain\n\n` +
        `${heure.substring(0, 5)} — ${clients.prenom || 'Client'} ` +
        `(${services.nom}, ${services.duree_minutes} min)`;

      await envoyerMessage(prestataires.telephone, messagePrestataire);
      await enregistrerNotification({
        reservation_id: reservation.id,
        destinataire_telephone: prestataires.telephone,
        destinataire_type: 'prestataire',
        type: 'rappel_rdv',
        statut: 'envoye',
        contenu: messagePrestataire,
        envoye_a: new Date().toISOString(),
      });

      envoyes++;
    } catch (err) {
      console.error(
        `[CRON] Erreur rappel réservation ${reservation.id} :`,
        err.message
      );

      await enregistrerNotification({
        reservation_id: reservation.id,
        destinataire_telephone: reservation.clients?.telephone,
        destinataire_type: 'client',
        type: 'rappel_rdv',
        statut: 'echec',
        envoye_a: new Date().toISOString(),
      });
    }
  }

  console.log(
    `[CRON] Rappels J-1 terminés — ${envoyes} envoyés, ${ignores} ignorés`
  );
}

// ================================
// CRON 2 — SUSPENSION ABONNEMENTS EXPIRÉS
// Tourne chaque nuit à minuit
// ================================
export async function suspendreAbonnementsExpires() {
  console.log(
    `[CRON] Suspension abonnements — démarrage ${new Date().toISOString()}`
  );

  const prestataires = await getPrestatairesExpires();
  console.log(
    `[CRON] ${prestataires.length} abonnement(s) expiré(s) trouvé(s)`
  );

  for (const prestataire of prestataires) {
    try {
      // Suspendre l'accès
      await suspendrePrestataire(prestataire.id);

      // Informer le prestataire
      const message =
        `⚠️ Votre abonnement Riserv a expiré.\n\n` +
        `Votre accès a été suspendu. Vos clients ne peuvent ` +
        `plus effectuer de nouvelles réservations.\n\n` +
        `Renouvelez votre abonnement pour réactiver votre compte.\n` +
        `Contactez-nous : +230 XXXX XXXX`;

      await envoyerMessage(prestataire.telephone, message);

      console.log(`[CRON] Prestataire suspendu : ${prestataire.nom}`);
    } catch (err) {
      console.error(
        `[CRON] Erreur suspension ${prestataire.nom} :`,
        err.message
      );
    }
  }

  console.log(`[CRON] Suspension abonnements terminée`);
}

// ================================
// CRON 3 — ALERTE EXPIRATION IMMINENTE (J-3)
// Tourne chaque matin à 9h
// ================================
export async function alerterExpirationImminente() {
  console.log(
    `[CRON] Alertes expiration imminente — démarrage ${new Date().toISOString()}`
  );

  const prestataires = await getPrestatairesExpirantBientot();
  console.log(`[CRON] ${prestataires.length} abonnement(s) expirant bientôt`);

  for (const prestataire of prestataires) {
    try {
      const dateExp = new Date(prestataire.date_expiration);
      const aujourd_hui = new Date();
      const joursRestants = Math.ceil(
        (dateExp - aujourd_hui) / (1000 * 60 * 60 * 24)
      );

      const message =
        `⚠️ Votre abonnement Riserv expire dans ${joursRestants} jour(s).\n\n` +
        `Date d'expiration : ${formaterDate(prestataire.date_expiration)}\n\n` +
        `Renouvelez maintenant pour continuer à recevoir des réservations sans interruption.\n` +
        `Contactez-nous : +230 XXXX XXXX`;

      await envoyerMessage(prestataire.telephone, message);
      console.log(
        `[CRON] Alerte envoyée à ${prestataire.nom} (${joursRestants}j restants)`
      );
    } catch (err) {
      console.error(`[CRON] Erreur alerte ${prestataire.nom} :`, err.message);
    }
  }

  console.log(`[CRON] Alertes expiration imminente terminées`);
}
