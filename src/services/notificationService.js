import { envoyerMessage } from './whatsappService.js';
import { enregistrerNotification } from './supabaseService.js';
import { formaterDate } from '../utils/dateUtils.js';

// ================================
// NOTIFICATION IMMÉDIATE
// Appelée à chaque événement (nouvelle résa, annulation, etc.)
// ================================

export async function notifierNouvelleReservation(reservation) {
  const { clients, services, prestataires, date, heure } = reservation;

  // Message au client
  const messageClient =
    `✅ Réservation confirmée !\n\n` +
    `Service : ${services.nom}\n` +
    `Date : ${formaterDate(date)}\n` +
    `Heure : ${heure.substring(0, 5)}\n` +
    `Chez : ${prestataires.nom}\n\n` +
    `Vous recevrez un rappel la veille.`;

  await envoyerMessage(clients.telephone, messageClient);
  await enregistrerNotification({
    reservation_id: reservation.id,
    destinataire_telephone: clients.telephone,
    destinataire_type: 'client',
    type: 'confirmation_rdv',
    statut: 'envoye',
    contenu: messageClient,
    envoye_a: new Date().toISOString(),
  });

  // Message au prestataire
  const messagePrestataire =
    `🔔 Nouvelle réservation !\n\n` +
    `Service : ${services.nom}\n` +
    `Date : ${formaterDate(date)}\n` +
    `Heure : ${heure.substring(0, 5)}\n` +
    `Client : ${clients.prenom || 'Nouveau client'} (${clients.telephone})`;

  await envoyerMessage(prestataires.telephone, messagePrestataire);
  await enregistrerNotification({
    reservation_id: reservation.id,
    destinataire_telephone: prestataires.telephone,
    destinataire_type: 'prestataire',
    type: 'nouvelle_resa',
    statut: 'envoye',
    contenu: messagePrestataire,
    envoye_a: new Date().toISOString(),
  });
}

export async function notifierAnnulation(reservation, annulePar) {
  const { clients, services, prestataires, date, heure } = reservation;

  if (annulePar === 'prestataire') {
    // Notifier le client
    const message =
      `❌ Votre rendez-vous a été annulé.\n\n` +
      `Service : ${services.nom}\n` +
      `Date : ${formaterDate(date)} à ${heure.substring(0, 5)}\n` +
      `Chez : ${prestataires.nom}\n\n` +
      `Contactez-nous pour reprogrammer.`;

    await envoyerMessage(clients.telephone, message);
    await enregistrerNotification({
      reservation_id: reservation.id,
      destinataire_telephone: clients.telephone,
      destinataire_type: 'client',
      type: 'annulation_rdv',
      statut: 'envoye',
      contenu: message,
      envoye_a: new Date().toISOString(),
    });
  } else {
    // Notifier le prestataire
    const message =
      `❌ Annulation de RDV\n\n` +
      `Client : ${clients.prenom || 'Client'} (${clients.telephone})\n` +
      `Service : ${services.nom}\n` +
      `Date : ${formaterDate(date)} à ${heure.substring(0, 5)}`;

    await envoyerMessage(prestataires.telephone, message);
    await enregistrerNotification({
      reservation_id: reservation.id,
      destinataire_telephone: prestataires.telephone,
      destinataire_type: 'prestataire',
      type: 'annulation_rdv',
      statut: 'envoye',
      contenu: message,
      envoye_a: new Date().toISOString(),
    });
  }
}

export async function notifierDeplacement(reservation) {
  const { clients, services, prestataires, date, heure } = reservation;

  const message =
    `📅 Votre rendez-vous a été déplacé.\n\n` +
    `Service : ${services.nom}\n` +
    `Nouvelle date : ${formaterDate(date)} à ${heure.substring(0, 5)}\n` +
    `Chez : ${prestataires.nom}`;

  await envoyerMessage(clients.telephone, message);
  await enregistrerNotification({
    reservation_id: reservation.id,
    destinataire_telephone: clients.telephone,
    destinataire_type: 'client',
    type: 'deplacement_rdv',
    statut: 'envoye',
    contenu: message,
    envoye_a: new Date().toISOString(),
  });
}
