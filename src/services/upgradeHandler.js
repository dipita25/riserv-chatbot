import {
  getDemandeUpgradeEnCours,
  creerDemandeUpgrade,
  incrementerMessagesUpgrade,
  validerDemandeUpgrade,
  supprimerDemandeUpgrade,
  getConversationUpgrade,
  ajouterMessageUpgrade,
  getConversation,
} from './supabaseService.js';
import { envoyerMessage } from './whatsappService.js';
import { appellerIADirect } from './claudeService.js';
import { formaterDate } from '../utils/dateUtils.js';
import { traiterSignalementPrioritaire } from './signalementUtils.js';

const MAX_MESSAGES_UPGRADE = 7;

// ================================
// DÉTAILS DES PLANS
// ================================
export function getDetailsPlan(plan) {
  const details = {
    starter: {
      prix: 990,
      avantages: [
        '✅ Agenda intelligent WhatsApp',
        '✅ Réservations clients automatiques',
        '✅ Gestion RDV en langage naturel',
        '✅ Notifications automatiques',
        '✅ Support multilingue (FR/EN/CR)',
        '✅ 30 messages IA/heure',
        '⏰ Réservations jusqu\'à 18h00',
      ],
    },
    pro: {
      prix: 1490,
      avantages: [
        '✅ Tout le plan Starter +',
        '🌟 Réservations 24h/24 (après 18h)',
        '🎤 Transcription notes vocales',
        '⚡ 100 messages IA/heure',
        '🔥 Support prioritaire',
      ],
    },
    business: {
      prix: 2490,
      avantages: [
        '✅ Tout le plan Pro +',
        '📊 Statistiques avancées',
        '🔔 Relances clients automatiques',
        '⚡ 200 messages IA/heure',
        '👨‍💼 Support dédié 24/7',
        '🎯 Gestionnaire de compte',
      ],
    },
  };
  return details[plan] || details.starter;
}

// ================================
// POINT D'ENTRÉE UPGRADE
// ================================
export async function handleUpgrade(from, body, numMedia, prestataire) {
  console.log(`[UPGRADE] Traitement demande pour ${prestataire.nom}`);

  const conversation = await getConversation(from);
  const contexteUpgrade = conversation?.messages || [];
  if (await traiterSignalementPrioritaire(from, body, contexteUpgrade, 'prestataire')) {
    return;
  }

  // Vérifier s'il y a une demande en cours
  let demande = await getDemandeUpgradeEnCours(prestataire.id);

  // Si image envoyée = preuve de paiement potentielle
  if (numMedia > 0) {
    if (!demande) {
      await envoyerMessage(
        from,
        `📎 J'ai bien reçu votre image.\n\n` +
          `Avant de traiter votre paiement, veuillez d'abord me préciser quel plan vous souhaitez :\n\n` +
          `1️⃣ Starter - Rs 990/mois\n` +
          `2️⃣ Pro - Rs 1,490/mois\n` +
          `3️⃣ Business - Rs 2,490/mois\n\n` +
          `Répondez simplement par le numéro ou le nom du plan.`
      );
      
      // Créer une demande temporaire
      const typeOp = prestataire.statut_abonnement === 'actif' ? 'upgrade' : 'renouvellement';
      demande = await creerDemandeUpgrade({
        prestataire_id: prestataire.id,
        plan_actuel: prestataire.plan,
        type: typeOp,
      });
      
      await ajouterMessageUpgrade(demande.id, 'user', `[IMAGE REÇUE]`);
      await incrementerMessagesUpgrade(demande.id);
      return;
    }

    // Si plan déjà choisi
    if (demande.plan_demande) {
      await traiterPreuvePaiement(from, prestataire, demande);
      return;
    }

    await envoyerMessage(
      from,
      `📎 Image reçue ! Mais je n'ai pas encore votre choix de plan.\n\n` +
        `Quel plan souhaitez-vous ?\n` +
        `1️⃣ Starter - Rs 990/mois\n` +
        `2️⃣ Pro - Rs 1,490/mois\n` +
        `3️⃣ Business - Rs 2,490/mois`
    );
    return;
  }

  // Créer ou récupérer la demande
  if (!demande) {
    const typeOp = prestataire.statut_abonnement === 'actif' ? 'upgrade' : 'renouvellement';
    demande = await creerDemandeUpgrade({
      prestataire_id: prestataire.id,
      plan_actuel: prestataire.plan,
      type: typeOp,
    });
  }

  // Vérifier le compteur de messages
  if (demande.messages_restants <= 0) {
    const supportEmail = process.env.SUPPORT_EMAIL || 'support@riserv.mu';
    await envoyerMessage(
      from,
      `⛔ Vous avez épuisé vos 7 messages de ${demande.type === 'upgrade' ? 'changement de plan' : 'renouvellement'}.\n\n` +
        `Pour finaliser votre demande, contactez notre support par email :\n` +
        `📧 ${supportEmail}\n\n` +
        `Nous traiterons votre dossier dans les plus brefs délais.`
    );
    return;
  }

  // Incrémenter le compteur
  await incrementerMessagesUpgrade(demande.id);
  await ajouterMessageUpgrade(demande.id, 'user', body);

  // Récupérer l'historique de la conversation
  const historique = await getConversationUpgrade(demande.id);

  // Analyser l'intention avec l'IA
  const intention = await analyserIntentionUpgrade(body, historique, prestataire, demande);

  let reponse = '';

  switch (intention.action) {
    case 'CHOISIR_PLAN':
      reponse = await traiterChoixPlan(from, prestataire, demande, intention.plan_choisi);
      break;

    case 'DEMANDER_INFOS':
      reponse = await donnerInfosPlan(intention.plan_demande);
      break;

    case 'CONFIRMER':
      reponse = await confirmerChoixPlan(from, prestataire, demande);
      break;

    case 'ANNULER':
      await supprimerDemandeUpgrade(demande.id);
      reponse = `Pas de souci ! Votre demande a été annulée.\n\nSi vous changez d'avis, écrivez-nous à nouveau.`;
      break;

    default:
      reponse = await gererMessageGeneral(body, historique, demande);
  }

  await ajouterMessageUpgrade(demande.id, 'assistant', reponse);
  await envoyerMessage(from, reponse);

  // Alerte messages restants
  const messagesRestants = MAX_MESSAGES_UPGRADE - demande.messages_utilises - 1;
  if (messagesRestants <= 3 && messagesRestants > 0) {
    await envoyerMessage(
      from,
      `⚠️ Messages restants : ${messagesRestants}/${MAX_MESSAGES_UPGRADE}`
    );
  }
}

// ================================
// ANALYSER L'INTENTION UPGRADE
// ================================
async function analyserIntentionUpgrade(body, historique, prestataire, demande) {
  const prompt = `Analyse cette demande d'un prestataire qui veut upgrader/renouveler son abonnement Riserv.

Historique de la conversation :
${historique.slice(-3).map(m => `${m.role}: ${m.contenu}`).join('\n')}

Message actuel : "${body}"

Plan actuel : ${prestataire.plan}
Type de demande : ${demande.type}
Plan déjà choisi ? ${demande.plan_demande || 'non'}

Réponds UNIQUEMENT en JSON :

Si le prestataire choisit un plan (dit "1", "2", "3", "Starter", "Pro", "Business", "oui je veux", etc.) :
{"action": "CHOISIR_PLAN", "plan_choisi": "starter|pro|business"}

Si le prestataire demande des infos sur un plan spécifique :
{"action": "DEMANDER_INFOS", "plan_demande": "starter|pro|business"}

Si le prestataire confirme son choix (dit "oui", "ok", "valide", etc.) ET qu'un plan est déjà choisi :
{"action": "CONFIRMER"}

Si le prestataire annule/abandonne :
{"action": "ANNULER"}

Sinon :
{"action": "MESSAGE_GENERAL"}`;

  try {
    const reponse = await appellerIADirect(prompt, body);
    const nettoye = reponse.replace(/```json|```/g, '').trim();
    return JSON.parse(nettoye);
  } catch {
    return { action: 'MESSAGE_GENERAL' };
  }
}

// ================================
// TRAITER LE CHOIX DU PLAN
// ================================
async function traiterChoixPlan(from, prestataire, demande, planChoisi) {
  const { default: supabase } = await import('./supabaseService.js');

  await supabase
    .from('demandes_upgrade')
    .update({ plan_demande: planChoisi })
    .eq('id', demande.id);

  const details = getDetailsPlan(planChoisi);
  const avantagesTexte = details.avantages.join('\n');

  const supportEmail = process.env.SUPPORT_EMAIL || 'support@riserv.mu';

  return (
    `✅ Excellent choix ! Plan *${planChoisi.toUpperCase()}* sélectionné.\n\n` +
    `💰 *Prix* : Rs ${details.prix}/mois\n\n` +
    `🎁 *Inclus :*\n${avantagesTexte}\n\n` +
    `💳 *Étape suivante :*\n` +
    `Effectuez votre paiement mobile de Rs ${details.prix} et envoyez-moi la capture d'écran.\n\n` +
    `Votre compte sera réactivé immédiatement après validation.\n\n` +
    `Questions ? ${supportEmail}`
  );
}

// ================================
// DONNER INFOS SUR UN PLAN
// ================================
async function donnerInfosPlan(plan) {
  const details = getDetailsPlan(plan);
  const avantagesTexte = details.avantages.join('\n');

  return (
    `📦 *Plan ${plan.toUpperCase()}* - Rs ${details.prix}/mois\n\n` +
    `${avantagesTexte}\n\n` +
    `Souhaitez-vous choisir ce plan ? Répondez "OUI" pour continuer.`
  );
}

// ================================
// CONFIRMER LE CHOIX
// ================================
async function confirmerChoixPlan(from, prestataire, demande) {
  if (!demande.plan_demande) {
    return `Vous n'avez pas encore choisi de plan. Quel plan souhaitez-vous ?\n\n1️⃣ Starter\n2️⃣ Pro\n3️⃣ Business`;
  }

  const details = getDetailsPlan(demande.plan_demande);

  return (
    `✅ Parfait !\n\n` +
    `Plan choisi : *${demande.plan_demande.toUpperCase()}* (Rs ${details.prix}/mois)\n\n` +
    `💳 *Procédez maintenant au paiement :*\n` +
    `Montant : Rs ${details.prix}\n` +
    `Méthode : Paiement mobile (Juice, MyCash, etc.)\n\n` +
    `📸 Envoyez-moi la capture d'écran de votre paiement.\n\n` +
    `⚡ Votre compte sera réactivé en quelques minutes.`
  );
}

// ================================
// TRAITER LA PREUVE DE PAIEMENT
// ================================
async function traiterPreuvePaiement(from, prestataire, demande) {
  if (!demande.plan_demande) {
    await envoyerMessage(
      from,
      `📎 Image reçue, mais vous n'avez pas encore choisi de plan.\n\n` +
        `Quel plan souhaitez-vous ?\n` +
        `1️⃣ Starter - Rs 990/mois\n` +
        `2️⃣ Pro - Rs 1,490/mois\n` +
        `3️⃣ Business - Rs 2,490/mois`
    );
    return;
  }

  const { default: supabase } = await import('./supabaseService.js');
  
  await supabase
    .from('demandes_upgrade')
    .update({ 
      preuve_paiement_url: '[IMAGE_RECUE]',
      updated_at: new Date().toISOString()
    })
    .eq('id', demande.id);

  // Notifier l'admin
  const adminPhone = process.env.ADMIN_PHONE;
  if (adminPhone) {
    await envoyerMessage(
      adminPhone,
      `💰 *Nouvelle demande d'upgrade/renouvellement*\n\n` +
        `Prestataire : ${prestataire.nom}\n` +
        `Téléphone : ${prestataire.telephone}\n` +
        `Plan actuel : ${prestataire.plan}\n` +
        `Plan demandé : ${demande.plan_demande}\n` +
        `Type : ${demande.type}\n\n` +
        `📸 Preuve de paiement reçue\n\n` +
        `Pour valider : "[nom prestataire] a payé"`
    );
  }

  const details = getDetailsPlan(demande.plan_demande);

  await envoyerMessage(
    from,
    `✅ Parfait ! J'ai bien reçu votre preuve de paiement.\n\n` +
      `📋 *Récapitulatif :*\n` +
      `Plan : ${demande.plan_demande.toUpperCase()}\n` +
      `Montant : Rs ${details.prix}/mois\n\n` +
      `⏳ Votre demande est en cours de validation.\n` +
      `Vous recevrez une confirmation dans les prochaines minutes.\n\n` +
      `Merci de votre confiance ! 🙏`
  );
}

// ================================
// GÉRER UN MESSAGE GÉNÉRAL
// ================================
async function gererMessageGeneral(body, historique, demande) {
  const supportEmail = process.env.SUPPORT_EMAIL || 'support@riserv.mu';

  if (!demande.plan_demande) {
    return (
      `Je suis là pour vous aider à renouveler votre abonnement Riserv.\n\n` +
      `Quel plan souhaitez-vous ?\n\n` +
      `1️⃣ *Starter* - Rs 990/mois\n` +
      `   Idéal pour démarrer\n\n` +
      `2️⃣ *Pro* - Rs 1,490/mois\n` +
      `   Réservations 24h/24 + notes vocales\n\n` +
      `3️⃣ *Business* - Rs 2,490/mois\n` +
      `   Statistiques + relances clients\n\n` +
      `Tapez 1, 2 ou 3 pour choisir.\n\n` +
      `Questions ? ${supportEmail}`
    );
  }

  return (
    `Vous avez sélectionné le plan *${demande.plan_demande.toUpperCase()}*.\n\n` +
    `💳 Envoyez-moi la capture d'écran de votre paiement pour finaliser.\n\n` +
    `Questions ? ${supportEmail}`
  );
}

// ================================
// NOTIFIER PRESTATAIRE - CLIENT BLOQUÉ APRÈS 18H
// ================================
export async function notifierPrestataireClientBloque18h(prestataire, clientTelephone) {
  const { default: supabase } = await import('./supabaseService.js');

  const { data: tentative } = await supabase
    .from('tentatives_client_apres_18h')
    .select('*')
    .eq('prestataire_id', prestataire.id)
    .eq('client_telephone', clientTelephone)
    .single();

  if (tentative) {
    await supabase
      .from('tentatives_client_apres_18h')
      .update({
        nombre_tentatives: tentative.nombre_tentatives + 1,
        derniere_tentative: new Date().toISOString(),
      })
      .eq('id', tentative.id);
  } else {
    await supabase.from('tentatives_client_apres_18h').insert({
      prestataire_id: prestataire.id,
      client_telephone: clientTelephone,
      nombre_tentatives: 1,
    });
  }

  const { error: journalErr } = await supabase
    .from('journal_tentatives_apres_18h')
    .insert({
      prestataire_id: prestataire.id,
      client_telephone: clientTelephone,
    });
  if (journalErr) {
    console.error('[BLOCAGE_18H] Insert journal:', journalErr.message);
  }
}
