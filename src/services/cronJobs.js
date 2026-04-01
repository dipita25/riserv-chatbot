import {
  getReservationsDemain,
  getPrestatairesExpires,
  getPrestatairesExpirantBientot,
  suspendrePrestataire,
  notificationDejaEnvoyee,
  enregistrerNotification,
  getClientsAvecAnnulationsExcessives,
  bannirClient,
  getClientParId,
  getTokenMetricsParDate,
  getTop5PrestatairesTokens,
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
      const dejaEnvoye = await notificationDejaEnvoyee(
        reservation.id,
        'rappel_rdv'
      );
      if (dejaEnvoye) {
        ignores++;
        continue;
      }

      const { clients, services, prestataires, date, heure } = reservation;

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
// Exclut les ambassadeurs (géré dans supabaseService)
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
      await suspendrePrestataire(prestataire.id);

      // Message différent selon essai gratuit ou abonnement payant
      const supportEmail = process.env.SUPPORT_EMAIL || 'support@riserv.mu';
      
      const message = prestataire.essai_gratuit
        ? `⚠️ Votre période d'essai gratuite Riserv est terminée.\n\n` +
          `Votre accès a été suspendu. Vos clients ne peuvent plus effectuer de nouvelles réservations.\n\n` +
          `📦 *Choisissez votre plan :*\n\n` +
          `1️⃣ *Starter* - Rs 990/mois\n` +
          `   • Agenda intelligent\n` +
          `   • 30 messages IA/heure\n` +
          `   • Réservations jusqu'à 18h\n\n` +
          `2️⃣ *Pro* - Rs 1,490/mois\n` +
          `   • Tout Starter +\n` +
          `   • Réservations 24h/24\n` +
          `   • Notes vocales\n` +
          `   • 100 messages IA/heure\n\n` +
          `3️⃣ *Business* - Rs 2,490/mois\n` +
          `   • Tout Pro +\n` +
          `   • Statistiques avancées\n` +
          `   • Relances clients\n` +
          `   • 200 messages IA/heure\n\n` +
          `💳 *Comment payer ?*\n` +
          `Effectuez un paiement mobile et envoyez-nous la capture d'écran ici avec le nom de votre plan.\n\n` +
          `⚠️ *IMPORTANT :* Vous disposez de 7 messages maximum dans cette conversation pour finaliser. Au-delà, vous devrez contacter le support par email.\n\n` +
          `Questions ? ${supportEmail}`
        : `⚠️ Votre abonnement Riserv a expiré.\n\n` +
          `Votre accès a été suspendu. Vos clients ne peuvent plus effectuer de nouvelles réservations.\n\n` +
          `📦 *Renouvelez votre abonnement :*\n\n` +
          `1️⃣ *Starter* - Rs 990/mois\n` +
          `2️⃣ *Pro* - Rs 1,490/mois\n` +
          `3️⃣ *Business* - Rs 2,490/mois\n\n` +
          `💳 *Comment payer ?*\n` +
          `Effectuez un paiement mobile et envoyez-nous la capture d'écran ici avec le nom de votre plan.\n\n` +
          `Votre compte sera réactivé immédiatement après validation.\n\n` +
          `⚠️ *IMPORTANT :* Vous disposez de 7 messages maximum dans cette conversation pour finaliser. Au-delà, vous devrez contacter le support par email.\n\n` +
          `Questions ? ${supportEmail}`;

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
// Exclut les ambassadeurs (géré dans supabaseService)
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

      const supportEmail = process.env.SUPPORT_EMAIL || 'support@riserv.mu';

      // Message différent selon essai gratuit ou abonnement payant
      const message = prestataire.essai_gratuit
        ? `⏳ Votre période d'essai gratuite Riserv se termine dans ${joursRestants} jour(s).\n\n` +
          `Date de fin : ${formaterDate(prestataire.date_expiration)}\n\n` +
          `📦 *Choisissez votre plan :*\n\n` +
          `1️⃣ *Starter* - Rs 990/mois\n` +
          `2️⃣ *Pro* - Rs 1,490/mois (recommandé)\n` +
          `3️⃣ *Business* - Rs 2,490/mois\n\n` +
          `💳 Effectuez votre paiement et envoyez-nous la preuve ici pour activer votre abonnement sans interruption.\n\n` +
          `⚠️ Après expiration, vous aurez 7 messages max pour renouveler. Anticipez maintenant !\n\n` +
          `Questions ? ${supportEmail}`
        : `⚠️ Votre abonnement Riserv expire dans ${joursRestants} jour(s).\n\n` +
          `Date d'expiration : ${formaterDate(prestataire.date_expiration)}\n\n` +
          `💳 *Renouvelez maintenant :*\n` +
          `Effectuez votre paiement et envoyez-nous la preuve ici.\n\n` +
          `Votre compte sera prolongé immédiatement.\n\n` +
          `⚠️ Après expiration, vous aurez 7 messages max pour renouveler. Anticipez maintenant !\n\n` +
          `Questions ? ${supportEmail}`;

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

// ================================
// CRON 4 — RAPPORT JOURNALIER ADMIN
// Tourne chaque jour à 17h00
// ================================
export async function envoyerRapportJournalier() {
  console.log(`[CRON] Rapport journalier — démarrage ${new Date().toISOString()}`);

  const adminPhone = process.env.ADMIN_PHONE;
  if (!adminPhone) {
    console.log(`[CRON] ADMIN_PHONE non défini — rapport annulé`);
    return;
  }

  const aujourd_hui = new Date();
  const dateStr = aujourd_hui.toISOString().split('T')[0];

  try {
    // Nouvelles souscriptions du jour
    const { data: nouvellesInscriptions } = await supabase
      .from('prestataires')
      .select('id, nom, plan, essai_gratuit')
      .gte('created_at', `${dateStr}T00:00:00`)
      .lte('created_at', `${dateStr}T23:59:59`);

    // Changements de plan du jour (paiements enregistrés aujourd'hui)
    const { data: changementsPlan } = await supabase
      .from('paiements')
      .select('prestataire_id, mois, valide_par')
      .gte('date_paiement', dateStr)
      .lte('date_paiement', dateStr);

    // Réservations du jour
    const { data: reservationsJour } = await supabase
      .from('reservations')
      .select('id, statut')
      .gte('created_at', `${dateStr}T00:00:00`)
      .lte('created_at', `${dateStr}T23:59:59`);

    // Annulations du jour
    const reservationsConfirmees = (reservationsJour || []).filter(r => r.statut === 'confirme');
    const reservationsAnnulees = (reservationsJour || []).filter(r => r.statut === 'annule');
    const totalReservations = reservationsJour?.length || 0;

    // Totaux prestataires actifs
    const { data: tousPrestataires } = await supabase
      .from('prestataires')
      .select('id, statut_abonnement, plan')
      .eq('statut_abonnement', 'actif');

    const totalActifs = tousPrestataires?.length || 0;
    const totalStarter = (tousPrestataires || []).filter(p => p.plan === 'starter').length;
    const totalPro = (tousPrestataires || []).filter(p => p.plan === 'pro').length;
    const totalBusiness = (tousPrestataires || []).filter(p => p.plan === 'business').length;

    // Calcul des pourcentages
    const pctConfirmees = totalReservations > 0
      ? Math.round((reservationsConfirmees.length / totalReservations) * 100)
      : 0;
    const pctAnnulees = totalReservations > 0
      ? Math.round((reservationsAnnulees.length / totalReservations) * 100)
      : 0;

    const lignesInscriptions = (nouvellesInscriptions || []).length > 0
      ? (nouvellesInscriptions || []).map(p =>
          `  • ${p.nom} — ${p.plan}${p.essai_gratuit ? ' (essai)' : ''}`
        ).join('\n')
      : '  Aucune';

    const lignesChangements = (changementsPlan || []).length > 0
      ? `${changementsPlan.length} changement(s) validé(s)`
      : 'Aucun';

    // =============================
    // NOUVELLES STATS : Consommation IA
    // =============================
    const { default: supabase } = await import('./supabaseService.js');
    const { data: metricsJour } = await supabase
      .from('token_metrics')
      .select('role, tokens_estimes')
      .eq('date', dateStr);

    const tokenParRole = {
      client: 0,
      prestataire: 0,
      onboarding: 0,
      admin: 0,
    };

    (metricsJour || []).forEach(m => {
      tokenParRole[m.role] = (tokenParRole[m.role] || 0) + m.tokens_estimes;
    });

    const totalTokens = Object.values(tokenParRole).reduce((sum, t) => sum + t, 0);

    const pctClients = totalTokens > 0 
      ? Math.round((tokenParRole.client / totalTokens) * 100) 
      : 0;
    const pctPrestataires = totalTokens > 0 
      ? Math.round((tokenParRole.prestataire / totalTokens) * 100) 
      : 0;
    const pctOnboarding = totalTokens > 0 
      ? Math.round((tokenParRole.onboarding / totalTokens) * 100) 
      : 0;
    const pctAdmin = totalTokens > 0 
      ? Math.round((tokenParRole.admin / totalTokens) * 100) 
      : 0;

    // Top 5 prestataires consommateurs
    const top5 = await getTop5PrestatairesTokens(dateStr);
    const lignesTop5 = top5.length > 0
      ? top5.map((p, i) => `${i + 1}. ${p.nom} — ${p.total.toLocaleString()} tokens`).join('\n')
      : 'Aucune donnée';

    const rapportTokens = totalTokens > 0
      ? `\n🤖 *Consommation IA (tokens estimés)*\n` +
        `Total : ${totalTokens.toLocaleString()} tokens\n` +
        `• Clients : ${tokenParRole.client.toLocaleString()} (${pctClients}%)\n` +
        `• Prestataires : ${tokenParRole.prestataire.toLocaleString()} (${pctPrestataires}%)\n` +
        `• Onboarding : ${tokenParRole.onboarding.toLocaleString()} (${pctOnboarding}%)\n` +
        `• Admin : ${tokenParRole.admin.toLocaleString()} (${pctAdmin}%)\n\n` +
        `🏆 *Top 5 prestataires (tokens)*\n${lignesTop5}\n\n`
      : '';

    const rapport =
      `📊 *Rapport journalier Riserv*\n` +
      `${aujourd_hui.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}\n\n` +
      `👥 *Prestataires actifs*\n` +
      `Total : ${totalActifs} | Starter : ${totalStarter} | Pro : ${totalPro} | Business : ${totalBusiness}\n\n` +
      `🆕 *Nouvelles souscriptions (${(nouvellesInscriptions || []).length})*\n` +
      `${lignesInscriptions}\n\n` +
      `💳 *Changements de plan*\n` +
      `${lignesChangements}\n\n` +
      `📅 *Réservations du jour (${totalReservations})*\n` +
      `Confirmées : ${reservationsConfirmees.length} (${pctConfirmees}%)\n` +
      `Annulées : ${reservationsAnnulees.length} (${pctAnnulees}%)` +
      rapportTokens;

    await envoyerMessage(adminPhone, rapport);
    console.log(`[CRON] Rapport journalier envoyé à l'admin`);

  } catch (err) {
    console.error(`[CRON] Erreur rapport journalier :`, err.message);
  }
}

// ================================
// CRON 5 — DÉTECTION CLIENTS ABUSIFS
// Tourne 2 fois par jour (matin et soir)
// Bannit les clients ayant 3+ annulations en 10 jours
// ================================
export async function detecterClientsAbusifs() {
  console.log(`[CRON] Détection clients abusifs — démarrage ${new Date().toISOString()}`);

  const adminPhone = process.env.ADMIN_PHONE;

  try {
    const clientsAbusifs = await getClientsAvecAnnulationsExcessives();
    console.log(`[CRON] ${clientsAbusifs.length} client(s) abusif(s) détecté(s)`);

    let bannis = 0;

    for (const clientData of clientsAbusifs) {
      try {
        const client = await getClientParId(clientData.clientId);
        
        if (!client || client.banni) {
          continue;
        }

        // Bannir le client
        await bannirClient(
          client.id,
          `Annulations répétées : ${clientData.count} annulations en 10 jours (détection automatique)`
        );

        // Notifier le client
        const supportEmail = process.env.SUPPORT_EMAIL || 'support@riserv.mu';
        
        await envoyerMessage(
          client.telephone,
          `⛔ Votre accès à la plateforme a été suspendu en raison de ${clientData.count} annulations répétées en moins de 10 jours.\n\n` +
          `Les annulations fréquentes nuisent aux prestataires et aux autres clients.\n\n` +
          `Si vous pensez qu'il s'agit d'une erreur, contactez notre support :\n` +
          `📧 ${supportEmail}\n\n` +
          `Vous serez recontacté dans les plus brefs délais.`
        );

        // Notifier l'admin
        if (adminPhone) {
          await envoyerMessage(
            adminPhone,
            `⚠️ *Client banni automatiquement*\n\n` +
            `Client : ${client.prenom || 'Sans nom'}\n` +
            `Téléphone : ${client.telephone}\n` +
            `Annulations : ${clientData.count} en 10 jours\n\n` +
            `Le client a été notifié.`
          );
        }

        bannis++;
        console.log(`[CRON] Client banni : ${client.telephone} (${clientData.count} annulations)`);

      } catch (err) {
        console.error(`[CRON] Erreur bannissement client ${clientData.clientId} :`, err.message);
      }
    }

    console.log(`[CRON] Détection clients abusifs terminée — ${bannis} client(s) banni(s)`);

  } catch (err) {
    console.error(`[CRON] Erreur détection clients abusifs :`, err.message);
  }
}

// ================================
// CRON 6 — NETTOYAGE TENTATIVES ANCIENNES
// Tourne chaque semaine (dimanche à 3h00)
// Nettoie les tentatives_inconnus de plus de 7 jours
// ================================
export async function nettoyerTentativesAnciennes() {
  console.log(`[CRON] Nettoyage tentatives anciennes — démarrage ${new Date().toISOString()}`);

  try {
    const il_y_a_7_jours = new Date();
    il_y_a_7_jours.setDate(il_y_a_7_jours.getDate() - 7);

    const { default: supabase } = await import('./supabaseService.js');
    const { data, error } = await supabase
      .from('tentatives_inconnus')
      .delete()
      .lt('premiere_tentative', il_y_a_7_jours.toISOString())
      .select();

    if (error) throw error;

    const nombreSupprime = data?.length || 0;
    console.log(`[CRON] ${nombreSupprime} tentative(s) ancienne(s) supprimée(s)`);

  } catch (err) {
    console.error(`[CRON] Erreur nettoyage tentatives :`, err.message);
  }
}

// ================================
// CRON 7 — NETTOYAGE RATE LIMITS
// Tourne toutes les heures
// Nettoie les entrées de plus de 2 heures
// ================================
export async function nettoyerRateLimits() {
  console.log(`[CRON] Nettoyage rate limits — démarrage ${new Date().toISOString()}`);

  try {
    const { supprimerRateLimitsAnciens } = await import('./supabaseService.js');
    const nombreSupprime = await supprimerRateLimitsAnciens();
    
    console.log(`[CRON] ${nombreSupprime} entrée(s) rate_limits supprimée(s)`);

  } catch (err) {
    console.error(`[CRON] Erreur nettoyage rate limits :`, err.message);
  }
}
