import crypto from 'crypto';
import {
  getPrestataire,
  getClient,
  getConversation,
  getOnboardingSession,
  getTentativesInconnu,
  incrementerTentativeInconnu,
  supprimerTentativeInconnu,
  supprimerOnboardingSession,
  supprimerConversation,
  getDemandeUpgradeEnCours,
} from './supabaseService.js';
import { detecterIntention } from './claudeService.js';
import {
  detecterBasculeVersOnboardingPrestataire,
  detecterBasculeVersReservationClient,
} from './intentionBascule.js';
import { envoyerMessage } from './whatsappService.js';
import { handleOnboarding } from './onboardingHandler.js';
import { handleClient } from './clientHandler.js';
import { handlePrestataire } from './prestataireHandler.js';
import { handleAdmin } from './adminHandler.js';
import { handleUpgrade } from './upgradeHandler.js';
import { verifierRateLimit, incrementerCompteur, getMessageQuotaDepasse } from './rateLimitService.js';

const LIMITE_TENTATIVES = 3;
const DELAI_BLOCAGE_HEURES = 24;

function fluxReservationClientSansFicheEngage(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return false;
  const marqueurs = [
    'prestataires qui pourraient vous convenir',
    'nom du prestataire choisi',
    'aucun prestataire partenaire inscrit',
    'trouver le bon prestataire',
    'type de service recherché',
    'type de prestation dans notre base',
  ];
  return messages.some(m => {
    if (m.role !== 'assistant' || typeof m.content !== 'string') return false;
    const c = m.content.toLowerCase();
    return marqueurs.some(s => c.includes(s));
  });
}

export async function router(from, body, numMedia) {
  const routerId = crypto.randomBytes(6).toString('hex');
  
  console.log(`\n[ROUTER ${routerId}] ========== ROUTAGE MESSAGE ==========`);
  console.log(`[ROUTER ${routerId}] De: ${from}`);
  console.log(`[ROUTER ${routerId}] Message: "${body.substring(0, 100)}${body.length > 100 ? '...' : ''}"`);
  console.log(`[ROUTER ${routerId}] Médias: ${numMedia}`);

  try {
    // ÉTAPE 0 — Super admin ?
    const adminPhone = process.env.ADMIN_PHONE;
    const estAdmin = adminPhone && from === adminPhone;
    
    if (estAdmin) {
      console.log(`[ROUTER ${routerId}] ✅ Identifié: ADMIN`);
      
      // Vérifier si l'admin veut utiliser les commandes admin ou tester comme prestataire/client
      const estCommandeAdmin = 
        body.toLowerCase().includes('stats') ||
        body.toLowerCase().includes('liste') ||
        body.toLowerCase().includes('info ') ||
        body.toLowerCase().includes('a payé') ||
        body.toLowerCase().includes('bloquer') ||
        body.toLowerCase().includes('débloquer') ||
        body.toLowerCase().includes('suspendre') ||
        body.toLowerCase().includes('réactiver') ||
        body.toLowerCase().includes('ambassadeur') ||
        body.toLowerCase().includes('débannir') ||
        body.toLowerCase().includes('plan ') ||
        body.toLowerCase().includes('changer le plan') ||
        body.toLowerCase().includes('quel plan') ||
        body.toLowerCase().includes('fiche ') ||
        body.toLowerCase().includes('détails ') ||
        body.toLowerCase().includes('detail ');

      if (estCommandeAdmin) {
        console.log(`[ROUTER ${routerId}] → Commande admin détectée`);
        await handleAdmin(from, body, numMedia);
        return;
      }
      
      console.log(`[ROUTER ${routerId}] → Admin en mode test/libre, flux normal continue`);
      // Sinon, l'admin peut discuter librement avec l'IA ou tester les fonctionnalités
      // On continue le flux normal pour qu'il puisse tester
    }

    // ÉTAPE 1 — Prestataire connu ?
    const prestataire = await getPrestataire(from);
    if (prestataire) {
      console.log(`[ROUTER ${routerId}] ✅ Identifié: PRESTATAIRE`, {
        nom: prestataire.nom,
        plan: prestataire.plan,
        statut: prestataire.statut_abonnement,
        langue: prestataire.langue,
      });
      
      // SOUS-ÉTAPE 1a — Prestataire suspendu/expiré avec demande d'upgrade ?
      if (prestataire.statut_abonnement !== 'actif') {
        console.log(`[ROUTER ${routerId}] ⚠️ Prestataire suspendu/expiré`);
        const demandeUpgrade = await getDemandeUpgradeEnCours(prestataire.id);
        
        if (demandeUpgrade || body.toLowerCase().includes('oui') || body.toLowerCase().includes('plan') || numMedia > 0) {
          console.log(`[ROUTER ${routerId}] → Mode upgrade/renouvellement activé`, {
            demandeEnCours: !!demandeUpgrade,
            motCleDetecte: body.toLowerCase().includes('oui') || body.toLowerCase().includes('plan'),
            mediaEnvoye: numMedia > 0,
          });
          await handleUpgrade(from, body, numMedia, prestataire);
          return;
        }
        
        console.log(`[ROUTER ${routerId}] → Aucune intention d'upgrade détectée, flux prestataire normal`);
      }
      
      // SOUS-ÉTAPE 1b — Prestataire Starter après 18h veut upgrader ?
      if (prestataire.plan === 'starter') {
        const heure = new Date().toLocaleString('en-US', { timeZone: 'Indian/Mauritius', hour: '2-digit', hour12: false });
        const heureActuelle = parseInt(heure);
        
        if (heureActuelle >= 18) {
          console.log(`[ROUTER ${routerId}] ⚠️ Prestataire Starter après 18h00`);
          const demandeUpgrade = await getDemandeUpgradeEnCours(prestataire.id);
          
          // Si demande en cours OU intention d'upgrade détectée
          if (demandeUpgrade || body.toLowerCase().includes('oui') || body.toLowerCase().includes('wi') || body.toLowerCase().includes('yes') || body.toLowerCase().includes('plan') || numMedia > 0) {
            console.log(`[ROUTER ${routerId}] → Mode upgrade activé pour Starter après 18h`, {
              demandeEnCours: !!demandeUpgrade,
              motCleDetecte: body.toLowerCase().includes('oui') || body.toLowerCase().includes('wi') || body.toLowerCase().includes('yes') || body.toLowerCase().includes('plan'),
              mediaEnvoye: numMedia > 0,
            });
            await handleUpgrade(from, body, numMedia, prestataire);
            return;
          }
          
          console.log(`[ROUTER ${routerId}] → Aucune intention d'upgrade, sera bloqué par verifierAcces`);
        }
      }
      
      // Vérifier rate limit (sauf pour admin)
      if (!estAdmin) {
        console.log(`[ROUTER ${routerId}] Vérification rate limit prestataire...`);
        const rateLimit = await verifierRateLimit(from, 'prestataire', prestataire.plan);
        
        if (!rateLimit.autorise) {
          console.log(`[ROUTER ${routerId}] ⛔ Rate limit dépassé`, {
            messagesUtilises: rateLimit.utilisationCourante,
            limite: rateLimit.limite,
          });
          await envoyerMessage(from, getMessageQuotaDepasse(rateLimit, 'prestataire', prestataire.plan, prestataire.langue));
          return;
        }
        
        console.log(`[ROUTER ${routerId}] ✅ Rate limit OK (${rateLimit.utilisationCourante + 1}/${rateLimit.limite})`);
        await incrementerCompteur(from, 'prestataire', prestataire.plan);
        await handlePrestataire(from, body, numMedia, prestataire, rateLimit);
      } else {
        console.log(`[ROUTER ${routerId}] Admin bypass rate limit`);
        // Admin sans rate limit
        await handlePrestataire(from, body, numMedia, prestataire, { autorise: true, restant: 999999 });
      }
      return;
    }

    // ÉTAPE 2 — Onboarding en cours ?
    const onboardingSession = await getOnboardingSession(from);
    if (onboardingSession) {
      console.log(`[ROUTER ${routerId}] ✅ Identifié: ONBOARDING`, {
        etape: onboardingSession.etape_courante,
      });

      if (await detecterBasculeVersReservationClient(body)) {
        console.log(
          `[ROUTER ${routerId}] ↪️ Bascule onboarding → réservation client (intention explicite)`
        );
        await supprimerOnboardingSession(from);
        await supprimerConversation(from).catch(() => {});
        const rateLimitClient = await verifierRateLimit(from, 'client', null);
        if (!rateLimitClient.autorise) {
          console.log(`[ROUTER ${routerId}] ⛔ Rate limit client dépassé`);
          await envoyerMessage(
            from,
            getMessageQuotaDepasse(rateLimitClient, 'client', null, 'fr')
          );
          return;
        }
        await incrementerCompteur(from, 'client', null);
        const clientPourFlux = await getClient(from);
        await handleClient(from, body, numMedia, clientPourFlux, rateLimitClient);
        return;
      }

      // Vérifier rate limit onboarding
      const rateLimit = await verifierRateLimit(from, 'onboarding', null);
      if (!rateLimit.autorise) {
        console.log(`[ROUTER ${routerId}] ⛔ Rate limit onboarding dépassé`);
        await envoyerMessage(from, getMessageQuotaDepasse(rateLimit, 'onboarding', null, 'fr'));
        return;
      }
      
      console.log(`[ROUTER ${routerId}] ✅ Rate limit OK, traitement onboarding`);
      await incrementerCompteur(from, 'onboarding', null);
      await handleOnboarding(from, body, onboardingSession, rateLimit);
      return;
    }

    // ÉTAPE 3 — Client connu ?
    const client = await getClient(from);
    if (client) {
      console.log(`[ROUTER ${routerId}] ✅ Identifié: CLIENT`, {
        prenom: client.prenom,
        langue: client.langue,
        banni: client.banni,
      });

      if (await detecterBasculeVersOnboardingPrestataire(body)) {
        console.log(
          `[ROUTER ${routerId}] ↪️ Bascule client connu → onboarding prestataire (intention explicite)`
        );
        await supprimerConversation(from).catch(() => {});
        await supprimerOnboardingSession(from).catch(() => {});
        const rateLimitOnboarding = await verifierRateLimit(from, 'onboarding', null);
        if (!rateLimitOnboarding.autorise) {
          console.log(`[ROUTER ${routerId}] ⛔ Rate limit onboarding dépassé`);
          await envoyerMessage(
            from,
            getMessageQuotaDepasse(rateLimitOnboarding, 'onboarding', null, client.langue || 'fr')
          );
          return;
        }
        await incrementerCompteur(from, 'onboarding', null);
        await handleOnboarding(from, body, null, rateLimitOnboarding);
        return;
      }

      // Vérifier rate limit client
      const rateLimit = await verifierRateLimit(from, 'client', null);
      if (!rateLimit.autorise) {
        console.log(`[ROUTER ${routerId}] ⛔ Rate limit client dépassé`);
        await envoyerMessage(from, getMessageQuotaDepasse(rateLimit, 'client', null, client.langue));
        return;
      }
      
      console.log(`[ROUTER ${routerId}] ✅ Rate limit OK, traitement client`);
      await incrementerCompteur(from, 'client', null);
      await handleClient(from, body, numMedia, client, rateLimit);
      return;
    }

    // ÉTAPE 4 — Numéro inconnu - Vérification tentatives
    console.log(`[ROUTER ${routerId}] ❓ Numéro inconnu, vérification tentatives...`);
    const tentatives = await getTentativesInconnu(from);
    
    if (tentatives && tentatives.nombre_tentatives >= LIMITE_TENTATIVES) {
      const premiereTentative = new Date(tentatives.premiere_tentative);
      const heuresEcoulees = (new Date() - premiereTentative) / (1000 * 60 * 60);
      
      console.log(`[ROUTER ${routerId}] ⚠️ Tentatives multiples détectées`, {
        nombreTentatives: tentatives.nombre_tentatives,
        heuresEcoulees: heuresEcoulees.toFixed(1),
        limiteBlocage: DELAI_BLOCAGE_HEURES,
      });
      
      if (heuresEcoulees < DELAI_BLOCAGE_HEURES) {
        console.log(`[ROUTER ${routerId}] ⛔ Numéro bloqué temporairement`);
        return;
      } else {
        console.log(`[ROUTER ${routerId}] Délai écoulé, suppression du blocage`);
        await supprimerTentativeInconnu(from);
      }
    }

    if (await detecterBasculeVersOnboardingPrestataire(body)) {
      console.log(
        `[ROUTER ${routerId}] ↪️ Bascule vers onboarding prestataire (y compris depuis flux réservation sans fiche)`
      );
      await supprimerTentativeInconnu(from);
      await supprimerConversation(from).catch(() => {});
      const rateLimitOnboarding = await verifierRateLimit(from, 'onboarding', null);
      if (!rateLimitOnboarding.autorise) {
        console.log(`[ROUTER ${routerId}] ⛔ Rate limit onboarding dépassé`);
        await envoyerMessage(
          from,
          getMessageQuotaDepasse(rateLimitOnboarding, 'onboarding', null, 'fr')
        );
        return;
      }
      await incrementerCompteur(from, 'onboarding', null);
      await handleOnboarding(from, body, null, rateLimitOnboarding);
      return;
    }

    const convSansCompte = await getConversation(from);
    if (fluxReservationClientSansFicheEngage(convSansCompte?.messages)) {
      console.log(
        `[ROUTER ${routerId}] ↪️ Flux réservation client (sans fiche) déjà engagé — on évite une nouvelle détection d'intention`
      );
      await supprimerTentativeInconnu(from);
      const rateLimitSuite = await verifierRateLimit(from, 'client', null);
      if (!rateLimitSuite.autorise) {
        console.log(`[ROUTER ${routerId}] ⛔ Rate limit client dépassé`);
        await envoyerMessage(
          from,
          getMessageQuotaDepasse(rateLimitSuite, 'client', null, 'fr')
        );
        return;
      }
      await incrementerCompteur(from, 'client', null);
      await handleClient(from, body, numMedia, null, rateLimitSuite);
      return;
    }

    // ÉTAPE 5 — Détection d'intention (coûte des tokens)
    console.log(`[ROUTER ${routerId}] Détection d'intention via IA...`);
    const intention = await detecterIntention(body);
    console.log(`[ROUTER ${routerId}] Intention détectée: ${intention}`);

    if (intention === 'ONBOARDING') {
      console.log(`[ROUTER ${routerId}] → Redirection vers onboarding`);
      await supprimerTentativeInconnu(from);
      await handleOnboarding(from, body, null);
      return;
    }

    if (intention === 'CLIENT') {
      console.log(`[ROUTER ${routerId}] → Redirection vers client`);
      await supprimerTentativeInconnu(from);
      const rateLimitClient = await verifierRateLimit(from, 'client', null);
      if (!rateLimitClient.autorise) {
        console.log(`[ROUTER ${routerId}] ⛔ Rate limit client dépassé`);
        await envoyerMessage(
          from,
          getMessageQuotaDepasse(rateLimitClient, 'client', null, 'fr')
        );
        return;
      }
      await incrementerCompteur(from, 'client', null);
      await handleClient(from, body, numMedia, null, rateLimitClient);
      return;
    }

    // ÉTAPE 6 — Si c'est l'admin qui teste, laisser passer
    if (estAdmin) {
      console.log(`[ROUTER ${routerId}] → Mode libre admin`);
      await envoyerMessage(
        from,
        `💬 Mode libre admin activé.\n\n` +
          `Vous pouvez discuter librement ou utiliser les commandes admin.\n\n` +
          `Pour tester les fonctionnalités prestataire/client, utilisez un numéro de test enregistré en base.`
      );
      return;
    }

    // Incrémenter les tentatives pour ce numéro inconnu
    console.log(`[ROUTER ${routerId}] Intention non reconnue, incrémentation tentative`);
    const nouvelleTentative = await incrementerTentativeInconnu(from);
    console.log(`[ROUTER ${routerId}] Tentative ${nouvelleTentative.nombre_tentatives}/${LIMITE_TENTATIVES}`);
    
    if (nouvelleTentative.nombre_tentatives >= LIMITE_TENTATIVES) {
      console.log(`[ROUTER ${routerId}] ⛔ Limite atteinte, blocage ${DELAI_BLOCAGE_HEURES}h`);
      const supportEmail = process.env.SUPPORT_EMAIL || 'support@riserv.mu';
      
      await envoyerMessage(
        from,
        `Nous n'avons pas pu identifier votre demande après plusieurs tentatives.\n\n` +
          `Veuillez réessayer dans 24 heures ou contactez notre support :\n` +
          `📧 ${supportEmail}`
      );
      return;
    }

    // Message différent selon le nombre de tentatives
    let messageChoix;
    if (nouvelleTentative.nombre_tentatives === 1) {
      messageChoix = 
        `Bonjour ! Êtes-vous :\n\n` +
        `1️⃣ Un professionnel souhaitant rejoindre Riserv\n` +
        `2️⃣ Un client souhaitant prendre rendez-vous`;
    } else {
      messageChoix = 
        `Merci de préciser votre demande :\n\n` +
        `• Tapez "1" si vous êtes un professionnel\n` +
        `• Tapez "2" si vous êtes un client\n\n` +
        `(Tentative ${nouvelleTentative.nombre_tentatives}/${LIMITE_TENTATIVES})`;
    }

    console.log(`[ROUTER ${routerId}] → Message de clarification envoyé`);
    await envoyerMessage(from, messageChoix);
  } catch (err) {
    console.error(`[ROUTER ${routerId}] ❌ ERREUR CRITIQUE:`, {
      error: err.message,
      stack: err.stack,
      from,
      body: body.substring(0, 100),
    });
    await envoyerMessage(
      from,
      `Une erreur s'est produite. Veuillez réessayer dans quelques instants.`
    );
  }
  
  console.log(`[ROUTER ${routerId}] ========== FIN ROUTAGE ==========\n`);
}
