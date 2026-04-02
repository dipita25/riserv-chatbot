import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ================================
// PRESTATAIRES
// ================================

export async function getPrestataire(telephone) {
  const { data, error } = await supabase
    .from('prestataires')
    .select(`*, services (*)`)
    .eq('telephone', telephone)
    .eq('statut_abonnement', 'actif')
    .single();

  if (error) return null;
  return data;
}

export async function getPrestataireParTelephone(telephone) {
  const { data, error } = await supabase
    .from('prestataires')
    .select(`*, services (*)`)
    .eq('telephone', telephone)
    .single();

  if (error) return null;
  return data;
}

export async function getPrestataireParNom(nom) {
  const { data, error } = await supabase
    .from('prestataires')
    .select('*')
    .ilike('nom', `%${nom}%`)
    .single();

  if (error) return null;
  return data;
}

export async function creerPrestataire(donnees) {
  const { data, error } = await supabase
    .from('prestataires')
    .insert(donnees)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function renouvelerAbonnement(prestataireId, mois) {
  const prestataire = await supabase
    .from('prestataires')
    .select('date_expiration')
    .eq('id', prestataireId)
    .single();

  const dateBase =
    prestataire.data?.date_expiration &&
    new Date(prestataire.data.date_expiration) > new Date()
      ? new Date(prestataire.data.date_expiration)
      : new Date();

  const nouvelleExpiration = new Date(dateBase);
  nouvelleExpiration.setMonth(nouvelleExpiration.getMonth() + mois);

  const { data, error } = await supabase
    .from('prestataires')
    .update({
      statut_abonnement: 'actif',
      essai_gratuit: false,
      date_expiration: nouvelleExpiration.toISOString().split('T')[0],
      date_dernier_paiement: new Date().toISOString().split('T')[0],
    })
    .eq('id', prestataireId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function enregistrerPaiement(donnees) {
  const { data, error } = await supabase
    .from('paiements')
    .insert(donnees)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function paiementDejaUtilise(reference) {
  const { data, error } = await supabase
    .from('paiements')
    .select('id')
    .eq('reference', reference)
    .single();

  if (error) return false;
  return !!data;
}

export async function getTousPrestataires() {
  const { data, error } = await supabase
    .from('prestataires')
    .select(
      'id, nom, telephone, plan, statut_abonnement, date_expiration, essai_gratuit, ambassadeur'
    )
    .order('nom');

  if (error) throw error;
  return data || [];
}

export async function getStatsGenerales() {
  const aujourd_hui = new Date().toISOString().split('T')[0];

  const [prestataires, reservationsAujourdhui, reservationsMois] =
    await Promise.all([
      supabase
        .from('prestataires')
        .select('id, statut_abonnement')
        .eq('statut_abonnement', 'actif'),
      supabase
        .from('reservations')
        .select('id')
        .eq('date', aujourd_hui)
        .eq('statut', 'confirme'),
      supabase
        .from('reservations')
        .select('id')
        .gte('date', aujourd_hui.substring(0, 7) + '-01')
        .eq('statut', 'confirme'),
    ]);

  return {
    prestatairesActifs: prestataires.data?.length || 0,
    reservationsAujourdhui: reservationsAujourdhui.data?.length || 0,
    reservationsMois: reservationsMois.data?.length || 0,
  };
}

// ================================
// CLIENTS
// ================================

export async function getClient(telephone) {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('telephone', telephone)
    .single();

  if (error) return null;
  return data;
}

export async function getClientParId(clientId) {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single();

  if (error) return null;
  return data;
}

export async function creerClient(donnees) {
  const { data, error } = await supabase
    .from('clients')
    .insert(donnees)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ================================
// ONBOARDING SESSIONS
// ================================

export async function getOnboardingSession(telephone) {
  const { data, error } = await supabase
    .from('onboarding_sessions')
    .select('*')
    .eq('telephone', telephone)
    .single();

  if (error) return null;
  return data;
}

export async function creerOnboardingSession(telephone) {
  const { data, error } = await supabase
    .from('onboarding_sessions')
    .insert({
      telephone,
      etape_courante: 'etape_1_nom',
      donnees_collectees: {},
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function mettreAJourOnboardingSession(telephone, miseAJour) {
  const { data, error } = await supabase
    .from('onboarding_sessions')
    .update(miseAJour)
    .eq('telephone', telephone)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function supprimerOnboardingSession(telephone) {
  const { error } = await supabase
    .from('onboarding_sessions')
    .delete()
    .eq('telephone', telephone);

  if (error) throw error;
}

// ================================
// CONVERSATIONS
// ================================

export async function getConversation(telephone) {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('telephone', telephone)
    .single();

  if (error) return null;
  return data;
}

export async function sauvegarderConversation(
  telephone,
  role,
  prestataireId,
  messages
) {
  const { data: existante } = await supabase
    .from('conversations')
    .select('id')
    .eq('telephone', telephone)
    .single();

  if (existante) {
    const { data, error } = await supabase
      .from('conversations')
      .update({
        messages,
        dernier_message_at: new Date().toISOString(),
      })
      .eq('telephone', telephone)
      .select()
      .single();

    if (error) throw error;
    return data;
  } else {
    const { data, error } = await supabase
      .from('conversations')
      .insert({
        telephone,
        role,
        prestataire_id: prestataireId,
        messages,
        dernier_message_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

/** Efface le prestataire lié (ex. le client veut réserver chez quelqu'un d'autre) */
export async function reinitialiserPrestataireConversation(telephone) {
  const { error } = await supabase
    .from('conversations')
    .update({ prestataire_id: null })
    .eq('telephone', telephone);

  if (error) throw error;
}

/** Supprime la conversation (ex. bascule onboarding ↔ réservation) */
export async function supprimerConversation(telephone) {
  const { error } = await supabase
    .from('conversations')
    .delete()
    .eq('telephone', telephone);

  if (error) throw error;
}

// ================================
// SERVICES
// ================================

export async function getServicesPrestataire(prestataireId) {
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('prestataire_id', prestataireId)
    .eq('actif', true)
    .order('nom');

  if (error) throw error;
  return data;
}

export async function ajouterService(prestataireId, service) {
  const { data, error } = await supabase
    .from('services')
    .insert({
      prestataire_id: prestataireId,
      nom: service.nom,
      duree_minutes: service.duree_minutes,
      prix: service.prix,
      actif: true,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function modifierService(serviceId, miseAJour) {
  const { data, error } = await supabase
    .from('services')
    .update(miseAJour)
    .eq('id', serviceId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function supprimerService(serviceId) {
  const { data, error } = await supabase
    .from('services')
    .update({ actif: false })
    .eq('id', serviceId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getReservationsFuturesService(serviceId) {
  const aujourd_hui = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('reservations')
    .select('id, date, heure')
    .eq('service_id', serviceId)
    .eq('statut', 'confirme')
    .gte('date', aujourd_hui);

  if (error) throw error;
  return data || [];
}

// ================================
// RÉSERVATIONS
// ================================

export async function getReservationsJour(prestataireId, date) {
  const { data, error } = await supabase
    .from('reservations')
    .select(`*, services (nom, duree_minutes)`)
    .eq('prestataire_id', prestataireId)
    .eq('date', date)
    .eq('statut', 'confirme')
    .order('heure');

  if (error) throw error;
  return data || [];
}

export async function creerReservation(donnees) {
  const { data, error } = await supabase
    .from('reservations')
    .insert(donnees)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function verifierCreneauDisponible(
  prestataireId,
  date,
  heure,
  dureeMinutes
) {
  const reservations = await getReservationsJour(prestataireId, date);

  const debutNouveauEnMin = heure
    .split(':')
    .reduce(
      (h, m, i) => (i === 0 ? parseInt(h) * 60 : parseInt(h) + parseInt(m)),
      0
    );
  const finNouveauEnMin = debutNouveauEnMin + dureeMinutes;

  const conflit = reservations.some(r => {
    const debutExistantEnMin = r.heure
      .split(':')
      .reduce(
        (h, m, i) => (i === 0 ? parseInt(h) * 60 : parseInt(h) + parseInt(m)),
        0
      );
    const finExistantEnMin = debutExistantEnMin + r.services.duree_minutes;
    return (
      debutNouveauEnMin < finExistantEnMin &&
      finNouveauEnMin > debutExistantEnMin
    );
  });

  return !conflit;
}

export async function getReservation(id) {
  const { data, error } = await supabase
    .from('reservations')
    .select(
      `
      *,
      clients (telephone, prenom),
      services (nom, duree_minutes, prix),
      prestataires (nom, telephone)
    `
    )
    .eq('id', id)
    .single();

  if (error) return null;
  return data;
}

export async function getPrestataireParSlug(slug) {
  const { data, error } = await supabase
    .from('prestataires')
    .select(`*, services (*)`)
    .eq('slug', slug)
    .eq('statut_abonnement', 'actif')
    .single();

  if (error) return null;
  return data;
}

export async function getReservationsSemaine(
  prestataireId,
  dateDebut,
  dateFin
) {
  const { data, error } = await supabase
    .from('reservations')
    .select(
      `
      *,
      clients (prenom, telephone),
      services (nom, duree_minutes, prix)
    `
    )
    .eq('prestataire_id', prestataireId)
    .gte('date', dateDebut)
    .lte('date', dateFin)
    .eq('statut', 'confirme')
    .order('date')
    .order('heure');

  if (error) throw error;
  return data || [];
}

export async function getReservationsClient(prestataireId, telephone) {
  const { data, error } = await supabase
    .from('reservations')
    .select(
      `
      *,
      clients (prenom, telephone),
      services (nom, duree_minutes, prix)
    `
    )
    .eq('prestataire_id', prestataireId)
    .eq('statut', 'confirme')
    .order('date', { ascending: false });

  if (error) throw error;
  return (data || []).filter(r => r.clients?.telephone === telephone);
}

export async function annulerReservation(reservationId, annulePar) {
  const { data, error } = await supabase
    .from('reservations')
    .update({ statut: 'annule', annule_par: annulePar })
    .eq('id', reservationId)
    .select(
      `
      *,
      clients (prenom, telephone),
      services (nom, duree_minutes),
      prestataires (nom, telephone)
    `
    )
    .single();

  if (error) throw error;
  return data;
}

export async function deplacerReservation(
  reservationId,
  nouvelleDate,
  nouvelleHeure
) {
  const { data, error } = await supabase
    .from('reservations')
    .update({ date: nouvelleDate, heure: nouvelleHeure })
    .eq('id', reservationId)
    .select(
      `
      *,
      clients (prenom, telephone),
      services (nom, duree_minutes),
      prestataires (nom, telephone)
    `
    )
    .single();

  if (error) throw error;
  return data;
}

export async function confirmerReservation(reservationId) {
  const { data, error } = await supabase
    .from('reservations')
    .update({ statut: 'confirme' })
    .eq('id', reservationId)
    .select(
      `
      *,
      clients (prenom, telephone),
      services (nom, duree_minutes),
      prestataires (nom, telephone)
    `
    )
    .single();

  if (error) throw error;
  return data;
}

// ================================
// DISPONIBILITÉS
// ================================

export async function bloquerCreneau(prestataireId, debut, fin, type, motif) {
  const { data, error } = await supabase
    .from('creneaux_bloques')
    .insert({ prestataire_id: prestataireId, debut, fin, type, motif })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getCreneau(prestataireId, date) {
  const { data, error } = await supabase
    .from('creneaux_bloques')
    .select('*')
    .eq('prestataire_id', prestataireId)
    .lte('debut', `${date}T23:59:59`)
    .gte('fin', `${date}T00:00:00`);

  if (error) throw error;
  return data || [];
}

// ================================
// SERVICES
// ===============

// ================================
// SIGNALEMENTS
// ================================

export async function enregistrerSignalement(donnees) {
  const { data, error } = await supabase
    .from('signalements')
    .insert(donnees)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getSignalements(statut) {
  const query = supabase
    .from('signalements')
    .select('*')
    .order('created_at', { ascending: false });

  if (statut) query.eq('statut', statut);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// ================================
// GESTION BANNISSEMENTS CLIENTS
// ================================

export async function bannirClient(clientId, raison) {
  const { data, error } = await supabase
    .from('clients')
    .update({ 
      banni: true, 
      raison_bannissement: raison,
      date_bannissement: new Date().toISOString()
    })
    .eq('id', clientId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function debannirClient(clientId) {
  const { data, error } = await supabase
    .from('clients')
    .update({ 
      banni: false, 
      raison_bannissement: null,
      date_bannissement: null
    })
    .eq('id', clientId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getAnnulationsRecentesClient(clientId, joursRecherche = 10) {
  const dateDebut = new Date();
  dateDebut.setDate(dateDebut.getDate() - joursRecherche);

  const { data, error } = await supabase
    .from('reservations')
    .select('id, date, heure, statut, annule_par, updated_at')
    .eq('client_id', clientId)
    .eq('statut', 'annule')
    .eq('annule_par', 'client')
    .gte('updated_at', dateDebut.toISOString())
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getClientsAvecAnnulationsExcessives() {
  const dateDebut = new Date();
  dateDebut.setDate(dateDebut.getDate() - 10);

  const { data, error } = await supabase
    .from('reservations')
    .select('client_id, clients (id, telephone, prenom, banni)')
    .eq('statut', 'annule')
    .eq('annule_par', 'client')
    .gte('updated_at', dateDebut.toISOString());

  if (error) throw error;

  const comptage = {};
  (data || []).forEach(r => {
    const clientId = r.client_id;
    if (!comptage[clientId]) {
      comptage[clientId] = { 
        count: 0, 
        client: r.clients,
        clientId: clientId
      };
    }
    comptage[clientId].count++;
  });

  return Object.values(comptage).filter(
    c => c.count >= 3 && !c.client?.banni
  );
}

// ================================
// GESTION BLOCAGE PRESTATAIRES
// ================================

export async function bloquerPrestataire(prestataireId) {
  const { data, error } = await supabase
    .from('prestataires')
    .update({ 
      statut_abonnement: 'bloque',
      date_blocage: new Date().toISOString()
    })
    .eq('id', prestataireId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function debloquerPrestataire(prestataireId) {
  const { data, error } = await supabase
    .from('prestataires')
    .update({ 
      statut_abonnement: 'actif',
      date_blocage: null
    })
    .eq('id', prestataireId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ================================
// GESTION PRESTATAIRES (fonctions utilitaires)
// ================================

export async function mettreAJourPrestataire(prestataireId, miseAJour) {
  const { data, error } = await supabase
    .from('prestataires')
    .update(miseAJour)
    .eq('id', prestataireId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function suspendrePrestataire(prestataireId) {
  const { data, error } = await supabase
    .from('prestataires')
    .update({ 
      statut_abonnement: 'expire',
    })
    .eq('id', prestataireId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getPrestatairesExpires() {
  const aujourd_hui = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('prestataires')
    .select('id, nom, telephone, date_expiration, essai_gratuit')
    .eq('statut_abonnement', 'actif')
    .lt('date_expiration', aujourd_hui)
    .eq('ambassadeur', false);

  if (error) throw error;
  return data || [];
}

export async function getPrestatairesExpirantBientot() {
  const aujourd_hui = new Date();
  const dans3Jours = new Date();
  dans3Jours.setDate(dans3Jours.getDate() + 3);

  const { data, error } = await supabase
    .from('prestataires')
    .select('id, nom, telephone, date_expiration, essai_gratuit')
    .eq('statut_abonnement', 'actif')
    .gte('date_expiration', aujourd_hui.toISOString().split('T')[0])
    .lte('date_expiration', dans3Jours.toISOString().split('T')[0])
    .eq('ambassadeur', false);

  if (error) throw error;
  return data || [];
}

export async function getReservationsDemain() {
  const demain = new Date();
  demain.setDate(demain.getDate() + 1);
  const dateDemain = demain.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('reservations')
    .select(
      `
      id,
      date,
      heure,
      clients (telephone, prenom),
      services (nom, duree_minutes),
      prestataires (nom, telephone)
    `
    )
    .eq('date', dateDemain)
    .eq('statut', 'confirme')
    .order('heure');

  if (error) throw error;
  return data || [];
}

// ================================
// NOTIFICATIONS
// ================================

export async function notificationDejaEnvoyee(reservationId, type) {
  const { data, error } = await supabase
    .from('notifications')
    .select('id')
    .eq('reservation_id', reservationId)
    .eq('type', type)
    .single();

  if (error) return false;
  return !!data;
}

export async function enregistrerNotification(donnees) {
  const { data, error } = await supabase
    .from('notifications')
    .insert(donnees)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ================================
// GESTION TENTATIVES NUMÉROS INCONNUS
// Pour éviter l'épuisement de tokens
// ================================

export async function getTentativesInconnu(telephone) {
  const { data, error } = await supabase
    .from('tentatives_inconnus')
    .select('*')
    .eq('telephone', telephone)
    .single();

  if (error) return null;
  return data;
}

export async function incrementerTentativeInconnu(telephone) {
  const tentative = await getTentativesInconnu(telephone);
  const maintenant = new Date().toISOString();

  if (!tentative) {
    const { data, error } = await supabase
      .from('tentatives_inconnus')
      .insert({
        telephone,
        nombre_tentatives: 1,
        premiere_tentative: maintenant,
        derniere_tentative: maintenant,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  const premiereTentative = new Date(tentative.premiere_tentative);
  const heures24Passees = (new Date() - premiereTentative) / (1000 * 60 * 60);

  if (heures24Passees > 24) {
    const { data, error } = await supabase
      .from('tentatives_inconnus')
      .update({
        nombre_tentatives: 1,
        premiere_tentative: maintenant,
        derniere_tentative: maintenant,
      })
      .eq('telephone', telephone)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from('tentatives_inconnus')
    .update({
      nombre_tentatives: tentative.nombre_tentatives + 1,
      derniere_tentative: maintenant,
    })
    .eq('telephone', telephone)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function supprimerTentativeInconnu(telephone) {
  const { error } = await supabase
    .from('tentatives_inconnus')
    .delete()
    .eq('telephone', telephone);

  if (error) throw error;
}

// ================================
// RATE LIMITING
// ================================

export async function getRateLimit(telephone) {
  const { data, error } = await supabase
    .from('rate_limits')
    .select('*')
    .eq('telephone', telephone)
    .order('heure_debut', { ascending: false })
    .limit(1)
    .single();

  if (error) return null;
  return data;
}

export async function creerOuMettreAJourRateLimit(telephone, role, plan, limite) {
  const rateLimitExistant = await getRateLimit(telephone);
  const maintenant = new Date();
  const heureActuelle = new Date(maintenant);
  heureActuelle.setMinutes(0, 0, 0);

  if (!rateLimitExistant) {
    const { data, error } = await supabase
      .from('rate_limits')
      .insert({
        telephone,
        role,
        plan,
        nombre_messages: 1,
        heure_debut: heureActuelle.toISOString(),
        limite_horaire: limite,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  const heureDebut = new Date(rateLimitExistant.heure_debut);
  const diffHeures = (maintenant - heureDebut) / (1000 * 60 * 60);

  // Pour onboarding, on garde le même compteur
  if (role === 'onboarding') {
    const { data, error } = await supabase
      .from('rate_limits')
      .update({
        nombre_messages: rateLimitExistant.nombre_messages + 1,
      })
      .eq('id', rateLimitExistant.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Si nouvelle heure, réinitialiser le compteur
  if (diffHeures >= 1) {
    const { data, error } = await supabase
      .from('rate_limits')
      .update({
        nombre_messages: 1,
        heure_debut: heureActuelle.toISOString(),
        limite_horaire: limite,
      })
      .eq('id', rateLimitExistant.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Incrémenter dans la même heure
  const { data, error } = await supabase
    .from('rate_limits')
    .update({
      nombre_messages: rateLimitExistant.nombre_messages + 1,
    })
    .eq('id', rateLimitExistant.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function supprimerRateLimitsAnciens() {
  const il_y_a_2h = new Date();
  il_y_a_2h.setHours(il_y_a_2h.getHours() - 2);

  const { data, error } = await supabase
    .from('rate_limits')
    .delete()
    .lt('heure_debut', il_y_a_2h.toISOString())
    .select();

  if (error) throw error;
  return data?.length || 0;
}

// ================================
// TOKEN METRICS
// ================================

export async function enregistrerTokenMetric(donnees) {
  const { data, error } = await supabase
    .from('token_metrics')
    .insert(donnees)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getTokenMetricsParDate(date) {
  const { data, error } = await supabase
    .from('token_metrics')
    .select('role, processus, tokens_estimes')
    .eq('date', date);

  if (error) throw error;
  return data || [];
}

export async function getTop5PrestatairesTokens(date) {
  const { data, error } = await supabase
    .from('token_metrics')
    .select('prestataire_id, prestataires(nom), tokens_estimes')
    .eq('date', date)
    .not('prestataire_id', 'is', null);

  if (error) throw error;

  // Agréger par prestataire
  const aggregated = {};
  (data || []).forEach(m => {
    if (!aggregated[m.prestataire_id]) {
      aggregated[m.prestataire_id] = {
        nom: m.prestataires?.nom || 'Inconnu',
        total: 0,
      };
    }
    aggregated[m.prestataire_id].total += m.tokens_estimes;
  });

  // Trier et prendre top 5
  return Object.values(aggregated)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
}

// ================================
// DEMANDES UPGRADE
// ================================
export async function getDemandeUpgradeEnCours(prestataireId) {
  const { data, error } = await supabase
    .from('demandes_upgrade')
    .select('*')
    .eq('prestataire_id', prestataireId)
    .eq('statut', 'en_attente')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) return null;
  return data;
}

export async function creerDemandeUpgrade(donnees) {
  const { data, error } = await supabase
    .from('demandes_upgrade')
    .insert({
      ...donnees,
      messages_utilises: 0,
      messages_restants: 7,
      statut: 'en_attente',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function incrementerMessagesUpgrade(demandeId) {
  const { data, error } = await supabase
    .from('demandes_upgrade')
    .select('messages_utilises')
    .eq('id', demandeId)
    .single();

  if (error) throw error;

  const nouveauNombre = (data.messages_utilises || 0) + 1;

  await supabase
    .from('demandes_upgrade')
    .update({ 
      messages_utilises: nouveauNombre,
      messages_restants: 7 - nouveauNombre,
      updated_at: new Date().toISOString()
    })
    .eq('id', demandeId);

  return nouveauNombre;
}

export async function validerDemandeUpgrade(demandeId, validePar) {
  const { data, error } = await supabase
    .from('demandes_upgrade')
    .update({ 
      statut: 'valide',
      valide_a: new Date().toISOString(),
      valide_par: validePar,
    })
    .eq('id', demandeId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function supprimerDemandeUpgrade(demandeId) {
  const { error } = await supabase
    .from('demandes_upgrade')
    .delete()
    .eq('id', demandeId);

  if (error) throw error;
}

export async function getConversationUpgrade(demandeId) {
  const { data, error } = await supabase
    .from('conversations_upgrade')
    .select('*')
    .eq('demande_id', demandeId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function ajouterMessageUpgrade(demandeId, role, contenu) {
  const { error } = await supabase
    .from('conversations_upgrade')
    .insert({
      demande_id: demandeId,
      role,
      contenu,
    });

  if (error) throw error;
}

export default supabase;
