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
    .select(
      `
      *,
      services (*)
    `
    )
    .eq('telephone', telephone)
    .eq('statut_abonnement', 'actif')
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
// CONVERSATIONS (contexte Claude)
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

// ================================
// RÉSERVATIONS
// ================================

export async function getReservationsJour(prestataireId, date) {
  const { data, error } = await supabase
    .from('reservations')
    .select(
      `
      *,
      services (nom, duree_minutes)
    `
    )
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

// ================================
// PRESTATAIRE PAR SLUG
// ================================

export async function getPrestataireParSlug(slug) {
  const { data, error } = await supabase
    .from('prestataires')
    .select(
      `
      *,
      services (*)
    `
    )
    .eq('slug', slug)
    .eq('statut_abonnement', 'actif')
    .single();

  if (error) return null;
  return data;
}

// ================================
// AGENDA
// ================================

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

  // Filtrer par téléphone client
  return (data || []).filter(r => r.clients?.telephone === telephone);
}

// ================================
// GESTION RDV
// ================================

export async function annulerReservation(reservationId, annulePar) {
  const { data, error } = await supabase
    .from('reservations')
    .update({
      statut: 'annule',
      annule_par: annulePar,
    })
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
    .update({
      date: nouvelleDate,
      heure: nouvelleHeure,
    })
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
    .insert({
      prestataire_id: prestataireId,
      debut,
      fin,
      type,
      motif,
    })
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
// ================================

export async function ajouterService(prestataireId, donnees) {
  const { data, error } = await supabase
    .from('services')
    .insert({
      prestataire_id: prestataireId,
      ...donnees,
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
  const { data, error } = await supabase
    .from('reservations')
    .select('id')
    .eq('service_id', serviceId)
    .eq('statut', 'confirme')
    .gte('date', new Date().toISOString().split('T')[0]);

  if (error) throw error;
  return data || [];
}

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

// ================================
// CRON — RAPPELS J-1
// ================================

export async function getReservationsDemain() {
  const demain = new Date();
  demain.setDate(demain.getDate() + 1);
  const dateDemain = demain.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('reservations')
    .select(
      `
      *,
      clients (prenom, telephone),
      services (nom, duree_minutes),
      prestataires (nom, telephone)
    `
    )
    .eq('date', dateDemain)
    .eq('statut', 'confirme');

  if (error) throw error;
  return data || [];
}

// ================================
// CRON — ABONNEMENTS EXPIRÉS
// ================================

export async function getPrestatairesExpires() {
  const aujourd_hui = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('prestataires')
    .select('id, nom, telephone, date_expiration')
    .eq('statut_abonnement', 'actif')
    .lt('date_expiration', aujourd_hui);

  if (error) throw error;
  return data || [];
}

export async function getPrestatairesExpirantBientot() {
  const aujourd_hui = new Date();
  const dansJours = new Date();
  dansJours.setDate(dansJours.getDate() + 3);

  const { data, error } = await supabase
    .from('prestataires')
    .select('id, nom, telephone, date_expiration')
    .eq('statut_abonnement', 'actif')
    .gte('date_expiration', aujourd_hui.toISOString().split('T')[0])
    .lte('date_expiration', dansJours.toISOString().split('T')[0]);

  if (error) throw error;
  return data || [];
}

export async function suspendrePrestataire(prestataireId) {
  const { error } = await supabase
    .from('prestataires')
    .update({ statut_abonnement: 'expire' })
    .eq('id', prestataireId);

  if (error) throw error;
}

// ================================
// NOTIFICATIONS — HISTORIQUE
// ================================

export async function enregistrerNotification(donnees) {
  const { error } = await supabase.from('notifications').insert(donnees);

  if (error)
    console.error('Erreur enregistrement notification :', error.message);
}

export async function notificationDejaEnvoyee(reservationId, type) {
  const { data, error } = await supabase
    .from('notifications')
    .select('id')
    .eq('reservation_id', reservationId)
    .eq('type', type)
    .eq('statut', 'envoye')
    .single();

  if (error) return false;
  return !!data;
}

export default supabase;
