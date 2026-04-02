-- Journal : une ligne par tentative de réservation bloquée après 18h (plan Starter)
-- Sert au rapport quotidien 06h00 (agrégation fenêtre veille 18h → lendemain 6h)

CREATE TABLE IF NOT EXISTS journal_tentatives_apres_18h (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prestataire_id UUID NOT NULL REFERENCES prestataires(id) ON DELETE CASCADE,
  client_telephone VARCHAR(20) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_journal_18h_created ON journal_tentatives_apres_18h(created_at);
CREATE INDEX IF NOT EXISTS idx_journal_18h_prestataire_created ON journal_tentatives_apres_18h(prestataire_id, created_at);
