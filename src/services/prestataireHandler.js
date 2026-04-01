import crypto from 'crypto';
import {
  notifierAnnulation,
  notifierDeplacement,
} from './notificationService.js';
import {
  getReservationsJour,
  getReservationsSemaine,
  getReservationsClient,
  annulerReservation,
  deplacerReservation,
  confirmerReservation,
  bloquerCreneau,
  getServicesPrestataire,
  ajouterService,
  modifierService,
  supprimerService,
  getReservationsFuturesService,
  mettreAJourPrestataire,
} from './supabaseService.js';
import { envoyerMessage } from './whatsappService.js';
import { envoyerMessageClaude } from './claudeService.js';
import { formaterDate, getJourSemaine } from '../utils/dateUtils.js';
import { verifierAcces } from '../middlewares/verifierAcces.js';
import { trackConsommationToken, getMessageQuotaRestant, SEUIL_ALERTE } from './rateLimitService.js';
import { estimerTokens } from '../utils/tokenEstimator.js';

// ================================
// SYSTEM PROMPT PRESTATAIRE
// ================================
function getSystemPromptPrestataire(prestataire) {
  return `Tu es l'assistant de gestion de Riserv pour ${prestataire.nom}.

Tu aides le prestataire à gérer son activité via WhatsApp en langage naturel.

RÈGLES :
- Réponds toujours dans la langue du prestataire (français, anglais ou créole mauricien)
- Sois efficace et concis — le prestataire est occupé
- Confirme toujours avant toute action irréversible (annulation, suppression)
- Si la demande est ambiguë, pose une question de clarification
- Ne pose qu'une question à la fois

FONCTIONNALITÉS DISPONIBLES :
- Agenda : voir RDV du jour, demain, un jour précis, la semaine
- RDV : annuler, déplacer, confirmer un RDV
- Disponibilités : bloquer créneaux, poser congés, modifier horaires
- Services : lister, ajouter, modifier, supprimer

SERVICES ACTUELS :
${prestataire.services
  .filter(s => s.actif)
  .map(s => `- ${s.nom} (${s.duree_minutes} min, Rs ${s.prix}) [id: ${s.id}]`)
  .join('\n')}

Quand tu dois effectuer une action, indique-le clairement dans ta réponse
en utilisant des balises d'action comme ceci :
[ACTION:TYPE:PARAMETRES]

Types d'actions disponibles :
[ACTION:AGENDA_JOUR:YYYY-MM-DD]
[ACTION:AGENDA_SEMAINE:YYYY-MM-DD:YYYY-MM-DD]
[ACTION:ANNULER_RDV:reservation_id]
[ACTION:CONFIRMER_RDV:reservation_id]
[ACTION:BLOQUER_CRENEAU:debut_iso:fin_iso:type:motif]
[ACTION:AJOUTER_SERVICE:nom:duree_minutes:prix]
[ACTION:MODIFIER_SERVICE:service_id:champ:valeur]
[ACTION:SUPPRIMER_SERVICE:service_id]
[ACTION:MODIFIER_HORAIRES:json_horaires]`;
}

// ================================
// POINT D'ENTRÉE PRINCIPAL
// ================================
export async function handlePrestataire(from, body, numMedia, prestataire, rateLimit) {
  const handlerId = crypto.randomBytes(4).toString('hex');
  
  console.log(`\n[PRESTATAIRE ${handlerId}] ========== DÉBUT TRAITEMENT ==========`);
  console.log(`[PRESTATAIRE ${handlerId}] Prestataire: ${prestataire.nom} (${prestataire.plan})`);
  console.log(`[PRESTATAIRE ${handlerId}] Message: "${body.substring(0, 100)}${body.length > 100 ? '...' : ''}"`);
  console.log(`[PRESTATAIRE ${handlerId}] Médias: ${numMedia}`);
  console.log(`[PRESTATAIRE ${handlerId}] Rate limit restant: ${rateLimit?.restant || 'N/A'}`);

  try {
    // Bypass pour l'admin — accès total sans restriction
    const adminPhone = process.env.ADMIN_PHONE;
    const estAdmin = adminPhone && from === adminPhone;

    // Vérifier que l'abonnement est actif (sauf pour l'admin)
    if (!estAdmin) {
      console.log(`[PRESTATAIRE ${handlerId}] Vérification accès...`);
      const acces = await verifierAcces(prestataire, 'agenda');

      if (!acces.autorise) {
        console.log(`[PRESTATAIRE ${handlerId}] ⛔ Accès refusé: ${acces.raison}`);
        await envoyerMessage(from, acces.message);
        return;
      }
      console.log(`[PRESTATAIRE ${handlerId}] ✅ Accès autorisé`);
    } else {
      console.log(`[PRESTATAIRE ${handlerId}] Admin détecté - Bypass complet`);
    }

    // Aide guidée — détecter si le prestataire est perdu
    const motsClesAide = ['aide', 'help', 'comment', 'ki manyer', 'how', '?'];
    const demandeAide = motsClesAide.some(mot =>
      body.toLowerCase().includes(mot)
    );

    if (demandeAide && body.length < 30) {
      console.log(`[PRESTATAIRE ${handlerId}] → Demande d'aide détectée`);
      await afficherMenuAide(from, prestataire);
      return;
    }

    const systemPrompt = getSystemPromptPrestataire(prestataire);
    const userPrompt = `Date et heure actuelles : ${new Date().toLocaleString('fr-FR', { timeZone: 'Indian/Mauritius' })}
    
    Message du prestataire : "${body}"`;

    console.log(`[PRESTATAIRE ${handlerId}] → Appel IA pour interpréter commande...`);
    // Envoyer à Claude pour interpréter la commande
    const reponse = await envoyerMessageClaude(
      from,
      'prestataire',
      prestataire.id,
      systemPrompt,
      userPrompt
    );

    // Tracker la consommation
    const tokensEstimes = estimerTokens(systemPrompt + userPrompt + reponse);
    console.log(`[PRESTATAIRE ${handlerId}] Tokens consommés (estimés): ${tokensEstimes}`);
    
    await trackConsommationToken(
      from,
      'prestataire',
      'gestion_generale',
      tokensEstimes,
      prestataire.id
    );

    console.log(`[PRESTATAIRE ${handlerId}] → Exécution actions détectées...`);
    // Extraire et exécuter les actions détectées
    const reponseFinale = await executerActions(from, reponse, prestataire, handlerId);

    console.log(`[PRESTATAIRE ${handlerId}] → Envoi réponse finale...`);
    // Envoyer la réponse finale au prestataire
    await envoyerMessage(from, reponseFinale);

    // Alerte quota restant si nécessaire
    if (rateLimit && rateLimit.restant <= SEUIL_ALERTE) {
      console.log(`[PRESTATAIRE ${handlerId}] ⚠️ Seuil d'alerte atteint: ${rateLimit.restant} messages restants`);
      const alerteMsg = getMessageQuotaRestant(
        rateLimit.restant,
        rateLimit.renouvellement,
        prestataire.langue || 'fr',
        'prestataire',
        prestataire.plan
      );
      await envoyerMessage(from, alerteMsg);
    }

    console.log(`[PRESTATAIRE ${handlerId}] ✅ Traitement terminé avec succès`);
  } catch (err) {
    console.error(`[PRESTATAIRE ${handlerId}] ❌ ERREUR CRITIQUE:`, {
      error: err.message,
      stack: err.stack,
      prestataire: prestataire.nom,
    });
    throw err;
  } finally {
    console.log(`[PRESTATAIRE ${handlerId}] ========== FIN TRAITEMENT ==========\n`);
  }
}

// ================================
// MENU D'AIDE
// ================================
async function afficherMenuAide(from, prestataire) {
  await envoyerMessage(
    from,
    `Bonjour ! Voici ce que je peux faire pour vous :\n\n` +
      `📅 *Agenda*\n` +
      `"agenda aujourd'hui" — voir vos RDV du jour\n` +
      `"agenda demain" — RDV de demain\n` +
      `"agenda semaine" — RDV de la semaine\n\n` +
      `✏️ *Rendez-vous*\n` +
      `"annule RDV [nom client]" — annuler un RDV\n` +
      `"déplace RDV [nom] à [date heure]" — déplacer\n` +
      `"confirme RDV [nom]" — confirmer\n\n` +
      `🔒 *Disponibilités*\n` +
      `"indispo [jour]" — bloquer un créneau\n` +
      `"congé du [date] au [date]" — poser des congés\n\n` +
      `💈 *Services*\n` +
      `"mes services" — voir la liste\n` +
      `"ajoute [service] [durée] [prix]" — ajouter\n` +
      `"modifie [service]" — modifier\n` +
      `"retire [service]" — supprimer`
  );
}

// ================================
// EXÉCUTER LES ACTIONS
// ================================
async function executerActions(from, reponse, prestataire, handlerId) {
  // Extraire toutes les actions de la réponse
  const regexAction = /\[ACTION:([^\]]+)\]/g;
  const actions = [];
  let match;

  while ((match = regexAction.exec(reponse)) !== null) {
    actions.push(match[1]);
  }

  console.log(`[PRESTATAIRE ${handlerId}] ${actions.length} action(s) détectée(s)`, {
    actions: actions.map(a => a.split(':')[0]),
  });

  // Supprimer les balises d'action du message final
  let reponseNette = reponse.replace(/\[ACTION:[^\]]+\]/g, '').trim();

  // Exécuter chaque action
  for (const action of actions) {
    const parties = action.split(':');
    const type = parties[0];

    try {
      console.log(`[PRESTATAIRE ${handlerId}] Exécution action: ${type}`, {
        parametres: parties.slice(1),
      });

      switch (type) {
        case 'AGENDA_JOUR': {
          const date = parties[1];
          const rdvs = await getReservationsJour(prestataire.id, date);
          console.log(`[PRESTATAIRE ${handlerId}] → Agenda jour: ${rdvs.length} RDV trouvés`);
          const texteAgenda = formaterAgendaJour(rdvs, date);
          reponseNette = texteAgenda;
          break;
        }

        case 'AGENDA_SEMAINE': {
          const dateDebut = parties[1];
          const dateFin = parties[2];
          const rdvs = await getReservationsSemaine(
            prestataire.id,
            dateDebut,
            dateFin
          );
          console.log(`[PRESTATAIRE ${handlerId}] → Agenda semaine: ${rdvs.length} RDV trouvés`);
          const texteAgenda = formaterAgendaSemaine(rdvs, dateDebut, dateFin);
          reponseNette = texteAgenda;
          break;
        }

        case 'ANNULER_RDV': {
          const reservationId = parties[1];
          console.log(`[PRESTATAIRE ${handlerId}] → Annulation RDV: ${reservationId}`);
          const rdv = await annulerReservation(reservationId, 'prestataire');
          await notifierAnnulation(rdv, 'prestataire');
          console.log(`[PRESTATAIRE ${handlerId}] ✅ RDV annulé et client notifié`);
          break;
        }

        case 'CONFIRMER_RDV': {
          const reservationId = parties[1];
          console.log(`[PRESTATAIRE ${handlerId}] → Confirmation RDV: ${reservationId}`);
          const rdv = await confirmerReservation(reservationId);
          // Notification de confirmation au client
          await envoyerMessage(
            rdv.clients.telephone,
            `✅ Votre rendez-vous du ${formaterDate(rdv.date)} à ` +
              `${rdv.heure.substring(0, 5)} chez ${rdv.prestataires.nom} est confirmé.`
          );
          console.log(`[PRESTATAIRE ${handlerId}] ✅ RDV confirmé et client notifié`);
          break;
        }

        case 'BLOQUER_CRENEAU': {
          const debut = parties[1];
          const fin = parties[2];
          const typeBlocage = parties[3] || 'indisponibilite';
          const motif = parties[4] || '';
          console.log(`[PRESTATAIRE ${handlerId}] → Blocage créneau`, {
            debut,
            fin,
            type: typeBlocage,
          });
          await bloquerCreneau(prestataire.id, debut, fin, typeBlocage, motif);
          console.log(`[PRESTATAIRE ${handlerId}] ✅ Créneau bloqué`);
          break;
        }

        case 'AJOUTER_SERVICE': {
          const nom = parties[1];
          const duree = parseInt(parties[2]);
          const prix = parseInt(parties[3]);
          console.log(`[PRESTATAIRE ${handlerId}] → Ajout service: ${nom} (${duree}min, Rs${prix})`);
          await ajouterService(prestataire.id, {
            nom,
            duree_minutes: duree,
            prix,
          });
          console.log(`[PRESTATAIRE ${handlerId}] ✅ Service ajouté`);
          break;
        }

        case 'MODIFIER_SERVICE': {
          const serviceId = parties[1];
          const champ = parties[2];
          const valeur =
            champ === 'duree_minutes' || champ === 'prix'
              ? parseInt(parties[3])
              : parties[3];
          console.log(`[PRESTATAIRE ${handlerId}] → Modification service ${serviceId}: ${champ} = ${valeur}`);
          await modifierService(serviceId, { [champ]: valeur });
          console.log(`[PRESTATAIRE ${handlerId}] ✅ Service modifié`);
          break;
        }

        case 'SUPPRIMER_SERVICE': {
          const serviceId = parties[1];
          console.log(`[PRESTATAIRE ${handlerId}] → Suppression service: ${serviceId}`);
          // Vérifier s'il y a des RDV futurs
          const rdvsFuturs = await getReservationsFuturesService(serviceId);
          if (rdvsFuturs.length > 0) {
            console.warn(`[PRESTATAIRE ${handlerId}] ⚠️ ${rdvsFuturs.length} RDV futur(s) liés à ce service`);
            reponseNette +=
              `\n\n⚠️ Attention : ${rdvsFuturs.length} RDV futur(s) ` +
              `sont liés à ce service. Ils ne seront pas annulés automatiquement.`;
          }
          await supprimerService(serviceId);
          console.log(`[PRESTATAIRE ${handlerId}] ✅ Service supprimé`);
          break;
        }

        case 'MODIFIER_HORAIRES': {
          const horaires = JSON.parse(parties.slice(1).join(':'));
          console.log(`[PRESTATAIRE ${handlerId}] → Modification horaires`, horaires);
          await mettreAJourPrestataire(prestataire.id, { horaires });
          console.log(`[PRESTATAIRE ${handlerId}] ✅ Horaires modifiés`);
          break;
        }

        default:
          console.warn(`[PRESTATAIRE ${handlerId}] ⚠️ Action inconnue: ${type}`);
      }
    } catch (err) {
      console.error(`[PRESTATAIRE ${handlerId}] ❌ Erreur action ${type}:`, {
        error: err.message,
        parametres: parties.slice(1),
        stack: err.stack,
      });
      reponseNette += `\n\n❌ Erreur lors de l'exécution de l'action ${type}.`;
    }
  }

  console.log(`[PRESTATAIRE ${handlerId}] Actions exécutées, réponse finale prête`);
  return reponseNette;
}

// ================================
// FORMATER L'AGENDA DU JOUR
// ================================
function formaterAgendaJour(rdvs, date) {
  if (rdvs.length === 0) {
    return `📅 ${formaterDate(date)}\n\nAucun rendez-vous ce jour.`;
  }

  const lignes = rdvs.map(
    r =>
      `${r.heure.substring(0, 5)} — ${r.clients?.prenom || 'Client'}, ` +
      `${r.services?.nom} (${r.services?.duree_minutes} min)`
  );

  return `📅 ${formaterDate(date)} — ${rdvs.length} RDV :\n\n${lignes.join('\n')}`;
}

// ================================
// FORMATER L'AGENDA DE LA SEMAINE
// ================================
function formaterAgendaSemaine(rdvs, dateDebut, dateFin) {
  if (rdvs.length === 0) {
    return `📅 Semaine du ${formaterDate(dateDebut)} au ${formaterDate(dateFin)}\n\nAucun rendez-vous cette semaine.`;
  }

  // Grouper par date
  const parDate = {};
  rdvs.forEach(r => {
    if (!parDate[r.date]) parDate[r.date] = [];
    parDate[r.date].push(r);
  });

  const lignes = Object.entries(parDate).map(([date, rdvsJour]) => {
    const resume = rdvsJour
      .map(r => `  ${r.heure.substring(0, 5)} ${r.clients?.prenom || 'Client'}`)
      .join('\n');
    return `${formaterDate(date)} (${rdvsJour.length} RDV) :\n${resume}`;
  });

  return `📅 Semaine du ${formaterDate(dateDebut)} :\n\n${lignes.join('\n\n')}`;
}
