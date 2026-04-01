import {
  getTousPrestataires,
  getStatsGenerales,
  getPrestataireParNom,
  getPrestataireParTelephone,
  renouvelerAbonnement,
  enregistrerPaiement,
  paiementDejaUtilise,
  mettreAJourPrestataire,
  suspendrePrestataire,
  bloquerPrestataire,
  debloquerPrestataire,
  getClientParId,
  debannirClient,
  getDemandeUpgradeEnCours,
  validerDemandeUpgrade,
} from './supabaseService.js';
import { envoyerMessage } from './whatsappService.js';
import { appellerIADirect } from './claudeService.js';
import { formaterDate } from '../utils/dateUtils.js';

// ================================
// POINT D'ENTRÉE ADMIN
// ================================
export async function handleAdmin(from, body, numMedia) {
  console.log(`[ADMIN] Commande : "${body}"`);

  try {
    // Traitement d'une image (preuve de paiement)
    if (numMedia > 0) {
      await traiterPreuvePaiement(from, body);
      return;
    }

    // Interpréter la commande admin avec l'IA
    const commande = await interpreterCommandeAdmin(body);

    switch (commande.action) {
      case 'STATS':
        await afficherStats(from);
        break;

      case 'LISTE_PRESTATAIRES':
        await listerPrestataires(from, commande.filtre);
        break;

      case 'PAIEMENT_VALIDER':
        await validerPaiementAdmin(
          from,
          commande.nom_prestataire,
          commande.mois || 1
        );
        break;

      case 'BLOQUER_PRESTATAIRE':
        await bloquerPrestataireAdmin(from, commande.nom_prestataire);
        break;

      case 'DEBLOQUER_PRESTATAIRE':
        await debloquerPrestataireAdmin(from, commande.nom_prestataire);
        break;

      case 'SUSPENDRE':
        await suspendreCompte(from, commande.nom_prestataire);
        break;

      case 'REACTIVER':
        await reactiverCompte(from, commande.nom_prestataire);
        break;

      case 'AMBASSADEUR':
        await definirAmbassadeur(from, commande.nom_prestataire);
        break;

      case 'INFO_PRESTATAIRE':
        await afficherInfoPrestataire(from, commande.nom_prestataire);
        break;

      case 'DEBANNIR_CLIENT':
        await debannirClientAdmin(from, commande.telephone_client);
        break;

      default:
        // Si l'admin envoie un message qui n'est pas une commande, lui permettre de discuter librement
        if (adminPhone && from === adminPhone) {
          await envoyerMessage(
            from,
            `💬 *Mode conversation libre activé*\n\n` +
              `Je peux vous aider avec n'importe quelle question.\n\n` +
              `Pour revenir aux commandes admin, utilisez les mots-clés habituels (stats, liste, etc.).`
          );
        } else {
          await envoyerMessage(
            from,
            `🔧 *Commandes disponibles :*\n\n` +
              `📊 *Stats*\n"stats" — vue d'ensemble\n\n` +
              `👥 *Prestataires*\n"liste prestataires" — tous les comptes\n` +
              `"liste actifs" — comptes actifs\n` +
              `"info [nom]" — détails d'un prestataire\n\n` +
              `💰 *Paiements*\n"[nom] a payé" — valider 1 mois\n` +
              `"[nom] a payé 3 mois" — valider plusieurs mois\n` +
              `(ou envoie une capture d'écran)\n\n` +
              `⚙️ *Gestion prestataires*\n"bloquer [nom]" — bloquer l'accès d'un prestataire\n` +
              `"débloquer [nom]" — débloquer un prestataire\n` +
              `"suspendre [nom]" — suspendre un compte\n` +
              `"réactiver [nom]" — réactiver un compte\n` +
              `"ambassadeur [nom]" — marquer comme ambassadeur\n\n` +
              `👤 *Gestion clients*\n"débannir [téléphone]" — débannir un client`
          );
        }
    }
  } catch (err) {
    console.error('[ADMIN] Erreur :', err.message);
    await envoyerMessage(from, `❌ Erreur : ${err.message}`);
  }
}

// ================================
// INTERPRÉTER LA COMMANDE ADMIN
// ================================
async function interpreterCommandeAdmin(body) {
  const reponse = await appellerIADirect(
    `Tu analyses des commandes d'administration pour un SaaS de réservation WhatsApp.
Réponds UNIQUEMENT en JSON valide, rien d'autre.

Actions possibles :
- STATS : demande de statistiques générales
- LISTE_PRESTATAIRES : liste des prestataires (filtre optionnel : "actifs", "expires", "essai")
- PAIEMENT_VALIDER : valider un paiement (nom_prestataire requis, mois optionnel)
- BLOQUER_PRESTATAIRE : bloquer l'accès d'un prestataire (nom_prestataire requis)
- DEBLOQUER_PRESTATAIRE : débloquer un prestataire (nom_prestataire requis)
- SUSPENDRE : suspendre un compte (nom_prestataire requis)
- REACTIVER : réactiver un compte (nom_prestataire requis)
- AMBASSADEUR : marquer comme ambassadeur (nom_prestataire requis)
- INFO_PRESTATAIRE : infos d'un prestataire (nom_prestataire requis)
- DEBANNIR_CLIENT : débannir un client (telephone_client requis)
- INCONNU : commande non reconnue

Format de réponse :
{"action": "STATS"}
{"action": "LISTE_PRESTATAIRES", "filtre": "actifs"}
{"action": "PAIEMENT_VALIDER", "nom_prestataire": "Salon Fatima", "mois": 1}
{"action": "BLOQUER_PRESTATAIRE", "nom_prestataire": "Beauty House"}
{"action": "DEBLOQUER_PRESTATAIRE", "nom_prestataire": "Beauty House"}
{"action": "SUSPENDRE", "nom_prestataire": "Beauty House"}
{"action": "INFO_PRESTATAIRE", "nom_prestataire": "Salon Fatima"}
{"action": "DEBANNIR_CLIENT", "telephone_client": "+23055555555"}
{"action": "INCONNU"}`,
    body
  );

  try {
    const nettoye = reponse.replace(/```json|```/g, '').trim();
    return JSON.parse(nettoye);
  } catch {
    return { action: 'INCONNU' };
  }
}

// ================================
// AFFICHER LES STATS
// ================================
async function afficherStats(from) {
  const stats = await getStatsGenerales();
  const prestataires = await getTousPrestataires();

  const actifs = prestataires.filter(
    p => p.statut_abonnement === 'actif'
  ).length;
  const enEssai = prestataires.filter(
    p => p.essai_gratuit && p.statut_abonnement === 'actif'
  ).length;
  const payants = prestataires.filter(
    p => !p.essai_gratuit && p.statut_abonnement === 'actif'
  ).length;
  const ambassadeurs = prestataires.filter(p => p.ambassadeur).length;
  const expires = prestataires.filter(
    p => p.statut_abonnement === 'expire'
  ).length;

  await envoyerMessage(
    from,
    `📊 *Tableau de bord Riserv*\n\n` +
      `👥 Prestataires actifs : ${actifs}\n` +
      `   • En essai gratuit : ${enEssai}\n` +
      `   • Abonnés payants : ${payants}\n` +
      `   • Ambassadeurs : ${ambassadeurs}\n` +
      `   • Suspendus/expirés : ${expires}\n\n` +
      `📅 Réservations aujourd'hui : ${stats.reservationsAujourdhui}\n` +
      `📅 Réservations ce mois : ${stats.reservationsMois}`
  );
}

// ================================
// LISTER LES PRESTATAIRES
// ================================
async function listerPrestataires(from, filtre) {
  let prestataires = await getTousPrestataires();

  if (filtre === 'actifs') {
    prestataires = prestataires.filter(p => p.statut_abonnement === 'actif');
  } else if (filtre === 'expires') {
    prestataires = prestataires.filter(p => p.statut_abonnement === 'expire');
  } else if (filtre === 'essai') {
    prestataires = prestataires.filter(
      p => p.essai_gratuit && p.statut_abonnement === 'actif'
    );
  }

  if (prestataires.length === 0) {
    await envoyerMessage(from, `Aucun prestataire trouvé.`);
    return;
  }

  const lignes = prestataires.map(p => {
    const statut = p.ambassadeur
      ? '🌟'
      : p.statut_abonnement === 'actif'
        ? '✅'
        : '❌';
    const type = p.essai_gratuit ? '(essai)' : '(payant)';
    const exp = p.date_expiration ? formaterDate(p.date_expiration) : 'N/A';
    return `${statut} ${p.nom} ${type}\n   Exp: ${exp}`;
  });

  await envoyerMessage(
    from,
    `👥 *${filtre ? filtre.toUpperCase() : 'TOUS'}* (${prestataires.length}) :\n\n${lignes.join('\n\n')}`
  );
}

// ================================
// VALIDER UN PAIEMENT (MODE ADMIN)
// ================================
async function validerPaiementAdmin(from, nomPrestataire, mois) {
  if (!nomPrestataire) {
    await envoyerMessage(from, `Précisez le nom du prestataire.`);
    return;
  }

  const prestataire = await getPrestataireParNom(nomPrestataire);

  if (!prestataire) {
    await envoyerMessage(
      from,
      `❌ Prestataire "${nomPrestataire}" non trouvé.`
    );
    return;
  }

  // Vérifier s'il y a une demande d'upgrade en cours
  const demandeUpgrade = await getDemandeUpgradeEnCours(prestataire.id);
  
  let planFinal = prestataire.plan;
  let messageSupplementaire = '';

  if (demandeUpgrade && demandeUpgrade.plan_demande) {
    // Upgrade de plan demandé
    planFinal = demandeUpgrade.plan_demande;
    messageSupplementaire = `\nPlan changé : ${prestataire.plan} → ${planFinal}`;
    
    // Mettre à jour le plan
    await mettreAJourPrestataire(prestataire.id, { 
      plan: planFinal,
      essai_gratuit: false
    });
    
    // Valider la demande
    await validerDemandeUpgrade(demandeUpgrade.id, 'admin');
  }

  const updated = await renouvelerAbonnement(prestataire.id, mois);

  await enregistrerPaiement({
    prestataire_id: prestataire.id,
    mois,
    valide_par: 'admin',
    date_paiement: new Date().toISOString().split('T')[0],
  });

  // Notifier le prestataire
  const messagePlan = demandeUpgrade?.plan_demande 
    ? `\n\n🎉 Votre plan a été upgradé vers *${planFinal.toUpperCase()}* !` 
    : '';

  await envoyerMessage(
    prestataire.telephone,
    `✅ Votre paiement a bien été reçu et votre abonnement Riserv est actif.\n\n` +
      `Abonnement valide jusqu'au : ${formaterDate(updated.date_expiration)}${messagePlan}\n\n` +
      `Merci pour votre confiance !`
  );

  await envoyerMessage(
    from,
    `✅ Paiement validé pour *${prestataire.nom}*\n` +
      `Durée : ${mois} mois\n` +
      `Nouveau statut : actif\n` +
      `Expiration : ${formaterDate(updated.date_expiration)}${messageSupplementaire}`
  );
}

// ================================
// TRAITER UNE PREUVE DE PAIEMENT (IMAGE)
// ================================
export async function traiterPreuvePaiement(from, caption) {
  await envoyerMessage(
    from,
    `📎 Preuve de paiement reçue. Analyse en cours...\n\nNote : l'analyse automatique d'images nécessite GPT-4o (vision). En attendant, utilisez la commande texte : "[Nom prestataire] a payé"`
  );

  // TODO : Activer quand GPT-4o vision sera configuré
  // Cette fonction sera complétée en V2 avec analyse d'image automatique
}

// ================================
// SUSPENDRE UN COMPTE
// ================================
async function suspendreCompte(from, nomPrestataire) {
  if (!nomPrestataire) {
    await envoyerMessage(from, `Précisez le nom du prestataire à suspendre.`);
    return;
  }

  const prestataire = await getPrestataireParNom(nomPrestataire);

  if (!prestataire) {
    await envoyerMessage(
      from,
      `❌ Prestataire "${nomPrestataire}" non trouvé.`
    );
    return;
  }

  await suspendrePrestataire(prestataire.id);

  await envoyerMessage(from, `✅ Compte *${prestataire.nom}* suspendu.`);
}

// ================================
// RÉACTIVER UN COMPTE
// ================================
async function reactiverCompte(from, nomPrestataire) {
  if (!nomPrestataire) {
    await envoyerMessage(from, `Précisez le nom du prestataire à réactiver.`);
    return;
  }

  const prestataire = await getPrestataireParNom(nomPrestataire);

  if (!prestataire) {
    await envoyerMessage(
      from,
      `❌ Prestataire "${nomPrestataire}" non trouvé.`
    );
    return;
  }

  await mettreAJourPrestataire(prestataire.id, { statut_abonnement: 'actif' });

  await envoyerMessage(from, `✅ Compte *${prestataire.nom}* réactivé.`);
}

// ================================
// DÉFINIR COMME AMBASSADEUR
// ================================
async function definirAmbassadeur(from, nomPrestataire) {
  if (!nomPrestataire) {
    await envoyerMessage(from, `Précisez le nom du prestataire.`);
    return;
  }

  const prestataire = await getPrestataireParNom(nomPrestataire);

  if (!prestataire) {
    await envoyerMessage(
      from,
      `❌ Prestataire "${nomPrestataire}" non trouvé.`
    );
    return;
  }

  // 3 mois gratuits pour les ambassadeurs
  const dateExpiration = new Date();
  dateExpiration.setMonth(dateExpiration.getMonth() + 3);

  await mettreAJourPrestataire(prestataire.id, {
    ambassadeur: true,
    essai_gratuit: false,
    statut_abonnement: 'actif',
    date_expiration: dateExpiration.toISOString().split('T')[0],
  });

  await envoyerMessage(
    prestataire.telephone,
    `🌟 Félicitations ! Vous êtes désormais ambassadeur Riserv.\n\n` +
      `Votre accès est offert pendant 3 mois en remerciement de votre soutien.\n\n` +
      `Expiration : ${formaterDate(dateExpiration.toISOString().split('T')[0])}\n\n` +
      `Merci de faire partie de l'aventure Riserv ! 🙏`
  );

  await envoyerMessage(
    from,
    `🌟 *${prestataire.nom}* est maintenant ambassadeur.\n` +
      `Accès gratuit jusqu'au : ${formaterDate(dateExpiration.toISOString().split('T')[0])}`
  );
}

// ================================
// AFFICHER LES INFOS D'UN PRESTATAIRE
// ================================
async function afficherInfoPrestataire(from, nomPrestataire) {
  if (!nomPrestataire) {
    await envoyerMessage(from, `Précisez le nom du prestataire.`);
    return;
  }

  const prestataire = await getPrestataireParNom(nomPrestataire);

  if (!prestataire) {
    await envoyerMessage(
      from,
      `❌ Prestataire "${nomPrestataire}" non trouvé.`
    );
    return;
  }

  const statut =
    prestataire.statut_abonnement === 'actif' ? '✅ Actif' : '❌ Suspendu';
  const type = prestataire.ambassadeur
    ? '🌟 Ambassadeur'
    : prestataire.essai_gratuit
      ? '🆓 Essai gratuit'
      : '💳 Abonné payant';

  await envoyerMessage(
    from,
    `📋 *${prestataire.nom}*\n\n` +
      `📱 Téléphone : ${prestataire.telephone}\n` +
      `📦 Plan : ${prestataire.plan}\n` +
      `${statut}\n` +
      `${type}\n` +
      `📅 Expiration : ${prestataire.date_expiration ? formaterDate(prestataire.date_expiration) : 'N/A'}`
  );
}

// ================================
// BLOQUER UN PRESTATAIRE
// ================================
async function bloquerPrestataireAdmin(from, nomPrestataire) {
  if (!nomPrestataire) {
    await envoyerMessage(from, `Précisez le nom du prestataire à bloquer.`);
    return;
  }

  const prestataire = await getPrestataireParNom(nomPrestataire);

  if (!prestataire) {
    await envoyerMessage(
      from,
      `❌ Prestataire "${nomPrestataire}" non trouvé.`
    );
    return;
  }

  await bloquerPrestataire(prestataire.id);

  const supportEmail = process.env.SUPPORT_EMAIL || 'support@riserv.mu';

  await envoyerMessage(
    prestataire.telephone,
    `⛔ Votre accès à Riserv a été bloqué par l'administration.\n\n` +
      `Votre entreprise est désactivée et vos clients ne peuvent plus prendre de rendez-vous.\n\n` +
      `Pour plus d'informations, contactez notre support :\n` +
      `📧 ${supportEmail}`
  );

  await envoyerMessage(
    from,
    `⛔ Compte *${prestataire.nom}* bloqué.\nL'entreprise est désactivée.`
  );
}

// ================================
// DÉBLOQUER UN PRESTATAIRE
// ================================
async function debloquerPrestataireAdmin(from, nomPrestataire) {
  if (!nomPrestataire) {
    await envoyerMessage(from, `Précisez le nom du prestataire à débloquer.`);
    return;
  }

  const prestataire = await getPrestataireParNom(nomPrestataire);

  if (!prestataire) {
    await envoyerMessage(
      from,
      `❌ Prestataire "${nomPrestataire}" non trouvé.`
    );
    return;
  }

  await debloquerPrestataire(prestataire.id);

  await envoyerMessage(
    prestataire.telephone,
    `✅ Votre accès à Riserv a été rétabli.\n\n` +
      `Votre entreprise est de nouveau active et vos clients peuvent prendre rendez-vous.\n\n` +
      `Merci de votre compréhension !`
  );

  await envoyerMessage(
    from,
    `✅ Compte *${prestataire.nom}* débloqué.\nL'entreprise est réactivée.`
  );
}

// ================================
// DÉBANNIR UN CLIENT
// ================================
async function debannirClientAdmin(from, telephone) {
  if (!telephone) {
    await envoyerMessage(from, `Précisez le numéro de téléphone du client.`);
    return;
  }

  const { default: supabase } = await import('./supabaseService.js');
  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('telephone', telephone)
    .single();

  if (!client) {
    await envoyerMessage(from, `❌ Client "${telephone}" non trouvé.`);
    return;
  }

  if (!client.banni) {
    await envoyerMessage(from, `ℹ️ Ce client n'est pas banni.`);
    return;
  }

  await debannirClient(client.id);

  await envoyerMessage(
    telephone,
    `✅ Votre accès à la plateforme Riserv a été rétabli.\n\n` +
      `Vous pouvez à nouveau effectuer des réservations.\n\n` +
      `Merci de votre compréhension !`
  );

  await envoyerMessage(
    from,
    `✅ Client *${client.prenom || telephone}* débanni.\nAccès rétabli.`
  );
}
