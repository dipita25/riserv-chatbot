-- ============================================
-- MIGRATION : Table signalements
-- Date : 2026-04-02
-- Description : Crée la table signalements si absente
--               et ajoute les colonnes manquantes, dont emetteur_telephone
-- ============================================

-- ================================
-- TABLE SIGNALEMENTS
-- ================================
CREATE TABLE IF NOT EXISTS signalements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emetteur_telephone VARCHAR(20) NOT NULL,
  emetteur_type VARCHAR(20) NOT NULL, -- 'client', 'prestataire', 'inconnu'
  type VARCHAR(50) NOT NULL DEFAULT 'autre',
  description TEXT NOT NULL,
  statut VARCHAR(20) NOT NULL DEFAULT 'en_attente', -- 'en_attente', 'en_cours', 'resolu', 'rejete'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Ajout des colonnes manquantes si la table existe deja
ALTER TABLE signalements
ADD COLUMN IF NOT EXISTS emetteur_telephone VARCHAR(20),
ADD COLUMN IF NOT EXISTS emetteur_type VARCHAR(20),
ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'autre',
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS statut VARCHAR(20) DEFAULT 'en_attente',
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Index pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_signalements_created_at ON signalements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signalements_statut ON signalements(statut);
CREATE INDEX IF NOT EXISTS idx_signalements_emetteur_telephone ON signalements(emetteur_telephone);

-- Commentaires
COMMENT ON TABLE signalements IS 'Signalements utilisateurs (bugs, incidents, retours)';
COMMENT ON COLUMN signalements.emetteur_telephone IS 'Numero WhatsApp de l emetteur';
COMMENT ON COLUMN signalements.emetteur_type IS 'Type emetteur: client, prestataire, inconnu';
COMMENT ON COLUMN signalements.statut IS 'Etat du traitement: en_attente, en_cours, resolu, rejete';
