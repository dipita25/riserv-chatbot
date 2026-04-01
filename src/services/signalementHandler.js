import { enregistrerSignalement } from './supabaseService.js';
import { envoyerMessage } from './whatsappService.js';

// ================================
// HANDLER POUR LES SIGNALEMENTS
// ================================
export async function handleSignalement(from, body, emetteurType, details) {
  console.log(`[SIGNALEMENT] Nouveau signalement de ${from}`);

  try {
    await enregistrerSignalement({
      emetteur_telephone: from,
      emetteur_type: emetteurType,
      description: details.description || body,
      type: details.type || 'autre',
      statut: 'en_attente',
    });

    await envoyerMessage(
      from,
      `✅ Votre signalement a bien été enregistré.\n\n` +
        `Notre équipe l'examinera dans les plus brefs délais.\n\n` +
        `Merci pour votre retour.`
    );

    const adminPhone = process.env.ADMIN_PHONE;
    if (adminPhone) {
      await envoyerMessage(
        adminPhone,
        `🚨 *Nouveau signalement*\n\n` +
          `De : ${from} (${emetteurType})\n` +
          `Type : ${details.type || 'autre'}\n` +
          `Description : ${details.description || body}`
      );
    }

    console.log(`[SIGNALEMENT] Signalement enregistré avec succès`);
  } catch (err) {
    console.error(`[SIGNALEMENT] Erreur :`, err.message);
    await envoyerMessage(
      from,
      `Une erreur s'est produite lors de l'enregistrement de votre signalement. Veuillez réessayer.`
    );
  }
}
