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
  const adminPhone = process.env.ADMIN_PHONE;

  try {
    // Traitement d'une image (preuve de paiement)
    if (numMedia > 0) {
      await traiterPreuvePaiement(from, body);
      return;
    }

    let commande = await interpreterCommandeAdmin(body);

    if (commande.action === 'DEMANDER_PRECISION') {
      const msg =
        commande.message?.trim() ||
        `Je n'ai pas bien compris. Reformulez la commande ou précisez le nom du prestataire concerné.`;
      await envoyerMessage(from, `❓ ${msg}`);
      return;
    }

    if (commande.action === 'INCONNU') {
      const fbPlan = extraireChangerPlanFallback(body);
      if (fbPlan) {
        commande = {
          action: 'CHANGER_PLAN',
          nom_prestataire: fbPlan.nom,
          plan: fbPlan.plan,
        };
      } else {
        const nomInfo = extraireInfoPrestataireFallback(body);
        if (nomInfo) {
          commande = { action: 'INFO_PRESTATAIRE', nom_prestataire: nomInfo };
        }
      }
    }

    const msgIncomplete = messageSiCommandeIncomplete(commande);
    if (msgIncomplete) {
      await envoyerMessage(from, `❓ ${msgIncomplete}`);
      return;
    }

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

      case 'CHANGER_PLAN':
        await definirPlanPrestataire(
          from,
          commande.nom_prestataire,
          commande.plan
        );
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
              `"info [nom]" / "plan de [nom]" / "quel plan pour [nom]" — voir plan, ambassadeur, expiration\n\n` +
              `💰 *Paiements*\n"[nom] a payé" — valider 1 mois\n` +
              `"[nom] a payé 3 mois" — valider plusieurs mois\n` +
              `(ou envoie une capture d'écran)\n\n` +
              `⚙️ *Gestion prestataires*\n"bloquer [nom]" — bloquer l'accès d'un prestataire\n` +
              `"débloquer [nom]" — débloquer un prestataire\n` +
              `"suspendre [nom]" — suspendre un compte\n` +
              `"réactiver [nom]" — réactiver un compte\n` +
              `"ambassadeur [nom]" — marquer comme ambassadeur\n` +
              `"plan [nom] starter|pro|business" — changer le plan d'un prestataire\n\n` +
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
// Fallback si l'IA ne reconnaît pas : "plan Nom du salon pro"
// ================================
function extraireChangerPlanFallback(body) {
  const t = body.trim();
  let m = t.match(/^plan\s+(.+)\s+(starter|pro|business)\s*$/i);
  if (m) return { nom: m[1].trim(), plan: m[2].toLowerCase() };
  m = t.match(/^(starter|pro|business)\s+plan\s+(.+)$/i);
  if (m) return { nom: m[2].trim(), plan: m[1].toLowerCase() };
  return null;
}

function normaliserPlanAdmin(planBrut) {
  if (!planBrut || typeof planBrut !== 'string') return null;
  const x = planBrut.toLowerCase().trim();
  return ['starter', 'pro', 'business'].includes(x) ? x : null;
}

/** Consultation prestataire sans passer par l'IA (ex. « plan de Salon X », « info Salon X ») */
function extraireInfoPrestataireFallback(body) {
  const t = body.trim();
  let m = t.match(/^info\s+(.+)$/i);
  if (m) return m[1].trim();
  m = t.match(/quel\s+plan\s+(?:pour|de|du)\s+(.+)$/i);
  if (m) return m[1].trim();
  m = t.match(/^plan\s+(?:de|du|pour)\s+(.+)$/i);
  if (m) return m[1].trim();
  m = t.match(/^(?:fiche|détails|detail)\s+(.+)$/i);
  if (m) return m[1].trim();
  return null;
}

// ================================
// Champs obligatoires manquants après interprétation (filet de sécurité)
// ================================
function messageSiCommandeIncomplete(commande) {
  const a = commande?.action;
  if (!a || a === 'INCONNU' || a === 'DEMANDER_PRECISION') return null;

  const nomManquant = () =>
    !commande.nom_prestataire || !String(commande.nom_prestataire).trim();

  switch (a) {
    case 'PAIEMENT_VALIDER':
    case 'BLOQUER_PRESTATAIRE':
    case 'DEBLOQUER_PRESTATAIRE':
    case 'SUSPENDRE':
    case 'REACTIVER':
    case 'AMBASSADEUR':
    case 'INFO_PRESTATAIRE':
      if (nomManquant()) {
        return `Quel prestataire ? Indiquez le nom (ou une partie du nom) de l'établissement.`;
      }
      return null;
    case 'CHANGER_PLAN':
      if (nomManquant()) {
        return `Pour quel prestataire souhaitez-vous changer le plan ? Et quel plan : starter, pro ou business ?`;
      }
      if (!normaliserPlanAdmin(commande.plan)) {
        return `Quel plan appliquer exactement : *starter*, *pro* ou *business* ?`;
      }
      return null;
    case 'DEBANNIR_CLIENT':
      if (!commande.telephone_client?.trim()) {
        return `Quel numéro de téléphone du client à débannir ? (format international, ex. +230…)`;
      }
      return null;
    default:
      return null;
  }
}

// ================================
// INTERPRÉTER LA COMMANDE ADMIN
// ================================
async function interpreterCommandeAdmin(body) {
  const reponse = await appellerIADirect(
    `Tu analyses des commandes d'administration pour un SaaS de réservation WhatsApp.
Réponds UNIQUEMENT en JSON valide, rien d'autre.

RÈGLES STRICTES :
- Si le message est ambigu, peut correspondre à plusieurs actions, ou manque un élément indispensable (nom de prestataire, plan, numéro) : utilise l'action DEMANDER_PRECISION avec un champ "message" en français, UNE question courte pour obtenir la précision nécessaire. Ne devine jamais un nom de prestataire ni une action destructive.
- Si tu hésites entre consulter des infos (INFO_PRESTATAIRE) et modifier quelque chose : demande la précision plutôt que d'exécuter une action d'écriture.
- Ne suppose pas l'intention si le texte est trop vague ("bloque-le", "le salon" sans contexte, etc.) : DEMANDER_PRECISION.
- Si le message n'est clairement aucune commande admin : INCONNU.

Actions possibles :
- DEMANDER_PRECISION : tu as besoin d'une précision avant d'agir. Champ obligatoire "message" : phrase courte à afficher au super admin pour qu'il précise sa demande.
- STATS : demande de statistiques générales
- LISTE_PRESTATAIRES : liste des prestataires (filtre optionnel : "actifs", "expires", "essai")
- PAIEMENT_VALIDER : valider un paiement (nom_prestataire requis, mois optionnel)
- BLOQUER_PRESTATAIRE : bloquer l'accès d'un prestataire (nom_prestataire requis)
- DEBLOQUER_PRESTATAIRE : débloquer un prestataire (nom_prestataire requis)
- SUSPENDRE : suspendre un compte (nom_prestataire requis)
- REACTIVER : réactiver un compte (nom_prestataire requis)
- AMBASSADEUR : marquer comme ambassadeur (nom_prestataire requis)
- CHANGER_PLAN : définir le plan d'abonnement d'un prestataire (nom_prestataire + plan requis). plan = "starter" | "pro" | "business" uniquement.
- INFO_PRESTATAIRE : consulter le profil d'un prestataire — plan, ambassadeur oui/non, statut, expiration (nom_prestataire requis). Utilise cette action pour toute question du type « quel plan pour X », « X est-il ambassadeur », « fiche Salon Y », sans modifier quoi que ce soit.
- DEBANNIR_CLIENT : débannir un client (telephone_client requis)
- INCONNU : le message ne ressemble pas à une commande admin
- DEMANDER_PRECISION : voir règles ci-dessus. Exemple : {"action":"DEMANDER_PRECISION","message":"Souhaitez-vous bloquer ou débloquer ce prestataire ? Indiquez le nom exact."}

Format de réponse :
{"action": "DEMANDER_PRECISION", "message": "Quel est le nom du prestataire concerné ?"}
{"action": "STATS"}
{"action": "LISTE_PRESTATAIRES", "filtre": "actifs"}
{"action": "PAIEMENT_VALIDER", "nom_prestataire": "Salon Fatima", "mois": 1}
{"action": "BLOQUER_PRESTATAIRE", "nom_prestataire": "Beauty House"}
{"action": "DEBLOQUER_PRESTATAIRE", "nom_prestataire": "Beauty House"}
{"action": "SUSPENDRE", "nom_prestataire": "Beauty House"}
{"action": "CHANGER_PLAN", "nom_prestataire": "Salon Fatima", "plan": "pro"}
{"action": "INFO_PRESTATAIRE", "nom_prestataire": "Salon Fatima"}
{"action": "DEBANNIR_CLIENT", "telephone_client": "+23055555555"}
{"action": "INCONNU"}`,
    body
  );

  try {
    const nettoye = reponse.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(nettoye);
    if (parsed.action === 'DEMANDER_PRECISION' && !parsed.message?.trim()) {
      return {
        action: 'DEMANDER_PRECISION',
        message:
          'Pouvez-vous reformuler votre commande en indiquant clairement le prestataire et l’action souhaitée ?',
      };
    }
    return parsed;
  } catch {
    return {
      action: 'DEMANDER_PRECISION',
      message:
        'Je n’ai pas pu interpréter la réponse technique. Reformulez votre commande (nom du prestataire + action).',
    };
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

  if (prestataire.ambassadeur) {
    const labelPlan =
      prestataire.plan === 'starter'
        ? 'Starter'
        : prestataire.plan === 'pro'
          ? 'Pro'
          : 'Business';
    await envoyerMessage(
      from,
      `ℹ️ *${prestataire.nom}* est déjà *ambassadeur*.\n\n` +
        `📦 Plan actuel : *${labelPlan}*\n` +
        `📅 Expiration : ${prestataire.date_expiration ? formaterDate(prestataire.date_expiration) : 'N/A'}\n\n` +
        `Aucune modification effectuée. Utilisez *plan [nom] starter|pro|business* pour ajuster le plan si besoin.`
    );
    return;
  }

  // 3 mois gratuits pour les ambassadeurs — plan Business (toutes les fonctionnalités)
  const dateExpiration = new Date();
  dateExpiration.setMonth(dateExpiration.getMonth() + 3);

  await mettreAJourPrestataire(prestataire.id, {
    ambassadeur: true,
    plan: 'business',
    essai_gratuit: false,
    statut_abonnement: 'actif',
    date_expiration: dateExpiration.toISOString().split('T')[0],
  });

  await envoyerMessage(
    prestataire.telephone,
    `🌟 Félicitations ! Vous êtes désormais ambassadeur Riserv.\n\n` +
      `Vous bénéficiez du *plan Business* (toutes les fonctionnalités) offert pendant 3 mois en remerciement de votre soutien.\n\n` +
      `Expiration : ${formaterDate(dateExpiration.toISOString().split('T')[0])}\n\n` +
      `Merci de faire partie de l'aventure Riserv ! 🙏`
  );

  await envoyerMessage(
    from,
    `🌟 *${prestataire.nom}* est maintenant ambassadeur (plan *Business*).\n` +
      `Accès gratuit jusqu'au : ${formaterDate(dateExpiration.toISOString().split('T')[0])}`
  );
}

// ================================
// CHANGER LE PLAN D'UN PRESTATAIRE (super admin)
// ================================
async function definirPlanPrestataire(from, nomPrestataire, planBrut) {
  if (!nomPrestataire?.trim()) {
    await envoyerMessage(
      from,
      `Indiquez le nom du prestataire et le plan : starter, pro ou business.\n\n` +
        `Exemple : *plan Salon Fatima pro*`
    );
    return;
  }

  const plan = normaliserPlanAdmin(planBrut);
  if (!plan) {
    await envoyerMessage(
      from,
      `Plan invalide. Utilisez uniquement : *starter*, *pro* ou *business*.`
    );
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

  const labelPlan =
    plan === 'starter' ? 'Starter' : plan === 'pro' ? 'Pro' : 'Business';

  if (prestataire.plan === plan) {
    await envoyerMessage(
      from,
      `ℹ️ *${prestataire.nom}* est déjà sur le plan *${labelPlan}*. Aucun changement.`
    );
    return;
  }

  await mettreAJourPrestataire(prestataire.id, { plan });

  await envoyerMessage(
    from,
    `✅ *${prestataire.nom}* est maintenant sur le plan *${labelPlan}*.`
  );

  await envoyerMessage(
    prestataire.telephone,
    `📦 Votre formule Riserv a été mise à jour : plan *${labelPlan}*.\n\n` +
      `Les nouvelles limites et fonctionnalités s'appliquent dès maintenant.`
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
  const labelPlan =
    prestataire.plan === 'starter'
      ? 'Starter'
      : prestataire.plan === 'pro'
        ? 'Pro'
        : 'Business';
  const type = prestataire.ambassadeur
    ? '🌟 Ambassadeur (programme soutien)'
    : prestataire.essai_gratuit
      ? '🆓 Essai gratuit'
      : '💳 Abonné payant';

  await envoyerMessage(
    from,
    `📋 *${prestataire.nom}*\n\n` +
      `📱 Téléphone : ${prestataire.telephone}\n` +
      `📦 *Plan d'abonnement : ${labelPlan}* (${prestataire.plan})\n` +
      `🌟 *Ambassadeur :* ${prestataire.ambassadeur ? 'Oui' : 'Non'}\n` +
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
