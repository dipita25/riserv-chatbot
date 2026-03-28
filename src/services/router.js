import {
  getPrestataire,
  getClient,
  getOnboardingSession,
} from './supabaseService.js';
import { detecterIntention } from './claudeService.js';
import { envoyerMessage } from './whatsappService.js';
import { handleOnboarding } from './onboardingHandler.js';
import { handleClient } from './clientHandler.js'; // ← ajouter
import { handlePrestataire } from './prestataireHandler.js'; // ← ajouter

export async function router(from, body, numMedia) {
  console.log(`\n--- Nouveau message ---`);
  console.log(`De : ${from}`);
  console.log(`Message : "${body}"`);

  try {
    // ÉTAPE 1 — Prestataire connu ?
    const prestataire = await getPrestataire(from);
    if (prestataire) {
      console.log(`Identifié : prestataire — ${prestataire.nom}`);
      await handlePrestataire(from, body, numMedia, prestataire); // ← remplacer
      return;
    }

    // ÉTAPE 2 — Onboarding en cours ?
    const onboardingSession = await getOnboardingSession(from);
    if (onboardingSession) {
      console.log(
        `Identifié : onboarding en cours — étape ${onboardingSession.etape_courante}`
      );
      await handleOnboarding(from, body, onboardingSession); // ← décommenter
      return;
    }

    // ÉTAPE 3 — Client connu ?
    const client = await getClient(from);
    if (client) {
      console.log(`Identifié : client connu — ${client.prenom || from}`);
      await handleClient(from, body, numMedia, client); // ← remplacer
      return;
    }

    // ÉTAPE 4 — Numéro inconnu
    const intention = await detecterIntention(body);

    if (intention === 'ONBOARDING') {
      await handleOnboarding(from, body, null);
      return;
    }

    if (intention === 'CLIENT') {
      await handleClient(from, body, numMedia, null); // ← remplacer
      return;
    }

    await envoyerMessage(
      from,
      `Bonjour ! Êtes-vous :\n\n` +
        `1️⃣ Un professionnel souhaitant rejoindre Riserv\n` +
        `2️⃣ Un client souhaitant prendre rendez-vous`
    );
  } catch (err) {
    console.error('Erreur dans le routeur :', err);
    await envoyerMessage(
      from,
      `Une erreur s'est produite. Veuillez réessayer dans quelques instants.`
    );
  }
}
