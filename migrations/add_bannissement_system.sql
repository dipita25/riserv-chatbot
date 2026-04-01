-- ============================================
-- MIGRATION : Système de bannissement et blocage
-- Date : 2026-03-30
-- Description : Ajoute les colonnes nécessaires pour bannir les clients,
--               bloquer les prestataires et limiter l'épuisement de tokens
-- ============================================

-- ================================
-- TABLE CLIENTS : Ajout colonnes bannissement
-- ================================
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS banni BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS raison_bannissement TEXT,
ADD COLUMN IF NOT EXISTS date_bannissement TIMESTAMP;

-- Créer un index pour optimiser les recherches de clients bannis
CREATE INDEX IF NOT EXISTS idx_clients_banni ON clients(banni);

-- ================================
-- TABLE PRESTATAIRES : Support statut "bloque"
-- ================================
ALTER TABLE prestataires
ADD COLUMN IF NOT EXISTS date_blocage TIMESTAMP;

-- ================================
-- TABLE TENTATIVES_INCONNUS : Limiter épuisement tokens
-- ================================
-- Évite que des numéros inconnus épuisent les tokens IA
-- en envoyant des messages ambigus à répétition
-- Limite : 3 tentatives par 24h, puis blocage temporaire

CREATE TABLE IF NOT EXISTS tentatives_inconnus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telephone VARCHAR(20) UNIQUE NOT NULL,
  nombre_tentatives INTEGER DEFAULT 1,
  premiere_tentative TIMESTAMP DEFAULT NOW(),
  derniere_tentative TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index pour recherche rapide par téléphone
CREATE INDEX IF NOT EXISTS idx_tentatives_telephone ON tentatives_inconnus(telephone);

-- Index pour nettoyage des anciennes tentatives
CREATE INDEX IF NOT EXISTS idx_tentatives_premiere ON tentatives_inconnus(premiere_tentative);

-- ================================
-- COMMENTAIRES
-- ================================
COMMENT ON COLUMN clients.banni IS 'Client banni suite à annulations répétées (3+ en 10 jours)';
COMMENT ON COLUMN clients.raison_bannissement IS 'Raison du bannissement';
COMMENT ON COLUMN clients.date_bannissement IS 'Date du bannissement';
COMMENT ON COLUMN prestataires.date_blocage IS 'Date du blocage par admin';
COMMENT ON TABLE tentatives_inconnus IS 'Compteur de tentatives pour numéros inconnus (limite 3 en 24h pour économiser tokens IA)';

-- ================================
-- NETTOYAGE AUTOMATIQUE
-- ================================
-- Un CRON job nettoie automatiquement les tentatives de plus de 7 jours
-- chaque dimanche à 3h00 (heure Maurice)

-- Vous pouvez aussi nettoyer manuellement :
-- DELETE FROM tentatives_inconnus WHERE premiere_tentative < NOW() - INTERVAL '7 days';

-- ================================
-- VÉRIFICATION
-- ================================
-- Vérifier que les colonnes ont été ajoutées :
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'clients';
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'prestataires';
-- SELECT * FROM tentatives_inconnus;
