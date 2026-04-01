// ================================
// FONCTIONNALITÉS PAR PLAN
// ================================
const FONCTIONNALITES_PAR_PLAN = {
  starter: [
    'agenda',
    'gestion_rdv',
    'disponibilites',
    'services',
    'aide_guidee',
    'multilingue',
  ],
  pro: [
    'agenda',
    'gestion_rdv',
    'disponibilites',
    'services',
    'aide_guidee',
    'multilingue',
    'notes_vocales',
    'reservations_apres_18h',
  ],
  business: [
    'agenda',
    'gestion_rdv',
    'disponibilites',
    'services',
    'aide_guidee',
    'multilingue',
    'notes_vocales',
    'reservations_apres_18h',
    'statistiques',
    'relances_clients',
  ],
};

// ================================
// HEURE MAURITIUS
// ================================
function getHeureMaurice() {
  const now = new Date();
  const heureMaurice = new Date(
    now.toLocaleString('en-US', { timeZone: 'Indian/Mauritius' })
  );
  return heureMaurice.getHours();
}

// ================================
// MESSAGES PAR LANGUE
// ================================
function getMessageAbonnementExpire(langue) {
  const supportEmail = process.env.SUPPORT_EMAIL || 'support@riserv.mu';
  
  switch (langue) {
    case 'en':
      return (
        `⚠️ Your Riserv subscription has expired.\n\n` +
        `Your access has been suspended. Your clients can no longer make new reservations.\n\n` +
        `📦 *Renew your subscription:*\n\n` +
        `1️⃣ *Starter* - Rs 990/month\n` +
        `2️⃣ *Pro* - Rs 1,490/month\n` +
        `3️⃣ *Business* - Rs 2,490/month\n\n` +
        `💳 Make your payment and send us proof here.\n\n` +
        `Your account will be reactivated immediately.\n\n` +
        `⚠️ *IMPORTANT:* You have 7 messages max in this conversation to complete renewal. After that, you'll need to contact support by email.\n\n` +
        `Questions? ${supportEmail}`
      );
    case 'cr':
      return (
        `⚠️ Votre abonnement Riserv finn expirer.\n\n` +
        `Ou pa kapav itiliz sistem la aster. Ou bann kliyan pa kapav fer nouvo rezervasyon.\n\n` +
        `📦 *Renouvle ou abonneman:*\n\n` +
        `1️⃣ *Starter* - Rs 990/mwa\n` +
        `2️⃣ *Pro* - Rs 1,490/mwa\n` +
        `3️⃣ *Business* - Rs 2,490/mwa\n\n` +
        `💳 Fer ou payeman ek anvoy nou preuve isi.\n\n` +
        `Ou kont pou reaktive imediatman.\n\n` +
        `⚠️ *IMPORTANT:* Ou ena 7 mesaz maximum dan sa konversasyon la pou fini renouvelman. Apre sa, bizin kontakte sipor par email.\n\n` +
        `Kesyon? ${supportEmail}`
      );
    default:
      return (
        `⚠️ Votre abonnement Riserv a expiré.\n\n` +
        `Votre accès est suspendu. Vos clients ne peuvent plus effectuer de nouvelles réservations.\n\n` +
        `📦 *Renouvelez votre abonnement :*\n\n` +
        `1️⃣ *Starter* - Rs 990/mois\n` +
        `2️⃣ *Pro* - Rs 1,490/mois\n` +
        `3️⃣ *Business* - Rs 2,490/mois\n\n` +
        `💳 Effectuez votre paiement et envoyez-nous la capture d'écran ici.\n\n` +
        `Votre compte sera réactivé immédiatement.\n\n` +
        `⚠️ *IMPORTANT :* Vous disposez de 7 messages maximum dans cette conversation pour finaliser le renouvellement. Au-delà, vous devrez contacter le support par email.\n\n` +
        `Questions ? ${supportEmail}`
      );
  }
}

function getMessageHorsHoraire(langue) {
  switch (langue) {
    case 'en':
      return (
        `🕕 Our booking service is available until 6:00 PM.\n\n` +
        `You can book from tomorrow morning. Feel free to write to us during opening hours!`
      );
    case 'cr':
      return (
        `🕕 Nou servis rezervasyon disponib ziska 18h00.\n\n` +
        `Ou kapav rezerv depi dime gramatin. Ekrir nou pandan nou zouer ouver!`
      );
    default:
      return (
        `🕕 Notre service de réservation est disponible jusqu'à 18h00.\n\n` +
        `Vous pourrez réserver dès demain matin. N'hésitez pas à nous écrire pendant nos heures d'ouverture !`
      );
  }
}

function getMessageHorsHorairePrestataire(langue) {
  const supportEmail = process.env.SUPPORT_EMAIL || 'support@riserv.mu';
  
  switch (langue) {
    case 'en':
      return (
        `🕕 Your Starter plan is available until 6:00 PM.\n\n` +
        `💡 *Want 24/7 access? Upgrade to PRO!*\n\n` +
        `📦 *PRO Plan* - Rs 1,490/month\n\n` +
        `✅ All Starter features +\n` +
        `🌟 24/7 access (manage your business anytime)\n` +
        `🌟 Bookings after 6:00 PM\n` +
        `🎤 Voice note transcription\n` +
        `⚡ 100 AI messages/hour\n` +
        `🔥 Priority support\n\n` +
        `💳 Want to upgrade? Reply "YES" and I'll guide you.\n\n` +
        `Questions? ${supportEmail}`
      );
    case 'cr':
      return (
        `🕕 Ou plan Starter disponib ziska 18h00.\n\n` +
        `💡 *Ou le aksese 24/7? Upgrade vers PRO!*\n\n` +
        `📦 *Plan PRO* - Rs 1,490/mwa\n\n` +
        `✅ Tou fonksyonalite Starter +\n` +
        `🌟 Aksese 24/7 (zeré ou biznes kan ou le)\n` +
        `🌟 Rezervasyon apre 18h00\n` +
        `🎤 Transkription note vokal\n` +
        `⚡ 100 mesaz IA/ler\n` +
        `🔥 Sipor prioriter\n\n` +
        `💳 Ou le upgrade? Repond "WI" ek mo pou gid ou.\n\n` +
        `Kesyon? ${supportEmail}`
      );
    default:
      return (
        `🕕 Votre plan Starter est disponible jusqu'à 18h00.\n\n` +
        `💡 *Vous voulez accéder 24h/24 ? Passez au plan PRO !*\n\n` +
        `📦 *Plan PRO* - Rs 1,490/mois\n\n` +
        `✅ Toutes les fonctionnalités Starter +\n` +
        `🌟 Accès 24h/24 (gérez votre activité à toute heure)\n` +
        `🌟 Réservations clients après 18h00\n` +
        `🎤 Transcription notes vocales\n` +
        `⚡ 100 messages IA/heure\n` +
        `🔥 Support prioritaire\n\n` +
        `💳 Vous voulez upgrader ? Répondez "OUI" et je vous guide.\n\n` +
        `Questions ? ${supportEmail}`
      );
  }
}

function getMessagePlanInsuffisant(fonctionnalite, planRequis, langue) {
  const nomsFonctionnalites = {
    notes_vocales: {
      fr: 'La transcription de notes vocales',
      en: 'Voice note transcription',
      cr: 'Transkription note vokal',
    },
    reservations_apres_18h: {
      fr: 'Les réservations après 18h00',
      en: 'Bookings after 6:00 PM',
      cr: 'Rezervasyon apre 18h00',
    },
    statistiques: {
      fr: 'Les statistiques avancées',
      en: 'Advanced statistics',
      cr: 'Statistik avanse',
    },
    relances_clients: {
      fr: 'Les relances clients',
      en: 'Client follow-ups',
      cr: 'Relans kliyan',
    },
  };

  const avantagesPlan = {
    pro: {
      fr: '• Réservations après 18h00\n• Transcription notes vocales\n• 100 messages IA/heure\n• Support prioritaire',
      en: '• Bookings after 6:00 PM\n• Voice note transcription\n• 100 AI messages/hour\n• Priority support',
      cr: '• Rezervasyon apre 18h00\n• Transkription note vokal\n• 100 mesaz IA/ler\n• Sipor prioriter',
    },
    business: {
      fr: '• Toutes les fonctionnalités Pro\n• Statistiques avancées\n• Relances clients automatiques\n• 200 messages IA/heure\n• Support dédié 24/7',
      en: '• All Pro features\n• Advanced statistics\n• Automatic client reminders\n• 200 AI messages/hour\n• Dedicated 24/7 support',
      cr: '• Tou fonksyonalite Pro\n• Statistik avanse\n• Relans kliyan otomatik\n• 200 mesaz IA/ler\n• Sipor dedie 24/7',
    },
  };

  const lang = langue || 'fr';
  const nomFonc = nomsFonctionnalites[fonctionnalite]?.[lang] || fonctionnalite;
  const avantages = avantagesPlan[planRequis]?.[lang] || '';

  const supportEmail = process.env.SUPPORT_EMAIL || 'support@riserv.mu';

  switch (lang) {
    case 'en':
      return (
        `⚠️ ${nomFonc} is only available with the ${planRequis.toUpperCase()} plan.\n\n` +
        `📦 *${planRequis.toUpperCase()} Plan* - Rs ${planRequis === 'pro' ? '1,490' : '2,490'}/month\n\n` +
        `${avantages}\n\n` +
        `💡 Would you like to upgrade to the ${planRequis.toUpperCase()} plan?\n\n` +
        `Reply "YES" to switch, or contact us: ${supportEmail}`
      );
    case 'cr':
      return (
        `⚠️ ${nomFonc} disponib zis avek plan ${planRequis.toUpperCase()}.\n\n` +
        `📦 *Plan ${planRequis.toUpperCase()}* - Rs ${planRequis === 'pro' ? '1,490' : '2,490'}/mwa\n\n` +
        `${avantages}\n\n` +
        `💡 Ou le upgrade vers plan ${planRequis.toUpperCase()}?\n\n` +
        `Repond "WI" pou chanze, ou kontakte nou: ${supportEmail}`
      );
    default:
      return (
        `⚠️ ${nomFonc} est disponible uniquement avec le plan ${planRequis.toUpperCase()}.\n\n` +
        `📦 *Plan ${planRequis.toUpperCase()}* - Rs ${planRequis === 'pro' ? '1,490' : '2,490'}/mois\n\n` +
        `${avantages}\n\n` +
        `💡 Souhaitez-vous passer au plan ${planRequis.toUpperCase()} ?\n\n` +
        `Répondez "OUI" pour changer de plan, ou écrivez-nous : ${supportEmail}`
      );
  }
}

// ================================
// VÉRIFICATION D'ACCÈS PRINCIPALE
// ================================
export async function verifierAcces(prestataire, fonctionnalite) {
  console.log(`[ACCES] Vérification accès`, {
    prestataire: prestataire.nom,
    telephone: prestataire.telephone,
    plan: prestataire.plan,
    statut: prestataire.statut_abonnement,
    fonctionnalite,
  });

  // 0. ADMIN — Bypass total pour l'admin
  const adminPhone = process.env.ADMIN_PHONE;
  if (adminPhone && prestataire.telephone === adminPhone) {
    console.log('[ACCES] ✅ Admin détecté → Bypass total');
    return { autorise: true };
  }

  // 1. Abonnement suspendu ou expiré ?
  if (prestataire.statut_abonnement !== 'actif') {
    console.log(`[ACCES] ⛔ Abonnement non actif: ${prestataire.statut_abonnement}`);
    return {
      autorise: false,
      raison: 'abonnement_expire',
      message: getMessageAbonnementExpire(prestataire.langue),
    };
  }

  // 2. Date d'expiration dépassée ?
  if (prestataire.date_expiration) {
    const expiration = new Date(prestataire.date_expiration);
    expiration.setHours(23, 59, 59, 999);
    if (expiration < new Date()) {
      console.log(`[ACCES] ⛔ Date expiration dépassée: ${prestataire.date_expiration}`);
      return {
        autorise: false,
        raison: 'abonnement_expire',
        message: getMessageAbonnementExpire(prestataire.langue),
      };
    }
  }

  // 3. Restriction horaire GLOBALE pour plan Starter — TOUT bloqué après 18h
  if (prestataire.plan === 'starter') {
    const heure = getHeureMaurice();
    if (heure >= 18) {
      console.log(`[ACCES] ⛔ Starter après 18h (heure: ${heure}h) - BLOQUÉ`);
      return {
        autorise: false,
        raison: 'hors_horaire_starter',
        message: getMessageHorsHorairePrestataire(prestataire.langue),
      };
    }
  }

  // 4. Restriction spécifique — réservations après 18h (pour plans Pro/Business)
  if (
    prestataire.plan === 'starter' &&
    fonctionnalite === 'reservations_apres_18h'
  ) {
    console.log(`[ACCES] ⛔ Starter ne peut pas accepter réservations après 18h`);
    return {
      autorise: false,
      raison: 'hors_horaire_starter',
      message: getMessageHorsHoraire(prestataire.langue),
    };
  }

  // 4. Fonctionnalité incluse dans le plan ?
  const fonctionnalitesPlan = FONCTIONNALITES_PAR_PLAN[prestataire.plan] || [];

  if (!fonctionnalitesPlan.includes(fonctionnalite)) {
    let planRequis = 'pro';
    if (
      FONCTIONNALITES_PAR_PLAN.business.includes(fonctionnalite) &&
      !FONCTIONNALITES_PAR_PLAN.pro.includes(fonctionnalite)
    ) {
      planRequis = 'business';
    }

    console.log(`[ACCES] ⛔ Fonctionnalité non incluse dans plan ${prestataire.plan}`, {
      fonctionnalite,
      planRequis,
    });

    return {
      autorise: false,
      raison: 'plan_insuffisant',
      planRequis,
      message: getMessagePlanInsuffisant(
        fonctionnalite,
        planRequis,
        prestataire.langue
      ),
    };
  }

  // 5. Tout est OK
  console.log(`[ACCES] ✅ Accès autorisé pour ${fonctionnalite}`);
  return { autorise: true };
}

export async function aAcces(prestataire, fonctionnalite) {
  const resultat = await verifierAcces(prestataire, fonctionnalite);
  return resultat.autorise;
}

// ================================
// VÉRIFICATION HORAIRE STARTER
// Appelée depuis clientHandler avant de démarrer une réservation
// ================================
export function estServiceDisponible(prestataire) {
  if (prestataire.plan !== 'starter') return { disponible: true };

  const heure = getHeureMaurice();
  if (heure >= 18) {
    return {
      disponible: false,
      message: getMessageHorsHoraire(prestataire.langue),
    };
  }

  return { disponible: true };
}
