// ================================
// UTILITAIRES DE DATES
// ================================

// Convertit "09:00" en minutes depuis minuit → 540
export function heureEnMinutes(heure) {
  const [h, m] = heure.split(':').map(Number);
  return h * 60 + m;
}

// Convertit 540 minutes en "09:00"
export function minutesEnHeure(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

// Retourne le nom du jour en abrégé depuis une date
// ex: "2026-03-28" → "sam"
export function getJourSemaine(dateStr) {
  const jours = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
  const date = new Date(dateStr + 'T12:00:00');
  return jours[date.getDay()];
}

// Formate une date en français
// ex: "2026-03-28" → "samedi 28 mars"
export function formaterDate(dateStr) {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

// Retourne les N prochains jours ouvrés selon les horaires du prestataire
export function getProchainsJoursOuvres(horaires, nombreJours = 7) {
  const joursOuvres = [];
  const aujourd_hui = new Date();
  aujourd_hui.setHours(0, 0, 0, 0);

  let cursor = new Date(aujourd_hui);
  cursor.setDate(cursor.getDate() + 1); // Commencer demain

  while (joursOuvres.length < nombreJours) {
    const jours = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
    const nomJour = jours[cursor.getDay()];
    const horaireJour = horaires[nomJour];

    if (horaireJour?.ouvert) {
      joursOuvres.push({
        date: cursor.toISOString().split('T')[0],
        horaire: horaireJour,
      });
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return joursOuvres;
}

// Calcule les créneaux libres pour un jour donné
export function getCreneauxLibres(
  horaire,
  dureeMinutes,
  reservationsExistantes
) {
  const debut = heureEnMinutes(horaire.debut);
  const fin = heureEnMinutes(horaire.fin);

  // Construire la liste des plages occupées
  const plagesOccupees = reservationsExistantes.map(r => ({
    debut: heureEnMinutes(r.heure),
    fin: heureEnMinutes(r.heure) + r.services.duree_minutes,
  }));

  const creneauxLibres = [];
  let cursor = debut;

  while (cursor + dureeMinutes <= fin) {
    const finCreneau = cursor + dureeMinutes;

    // Vérifier si ce créneau chevauche une réservation existante
    const estOccupe = plagesOccupees.some(
      plage => cursor < plage.fin && finCreneau > plage.debut
    );

    if (!estOccupe) {
      creneauxLibres.push(minutesEnHeure(cursor));
    }

    // Avancer par pas de 15 minutes
    cursor += 15;
  }

  return creneauxLibres;
}
