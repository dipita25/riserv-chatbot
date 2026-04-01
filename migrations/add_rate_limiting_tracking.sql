-- ============================================
-- MIGRATION : Rate Limiting et Tracking de consommation
-- Date : 2026-03-30
-- Description : Ajoute les tables pour limiter les messages par utilisateur
--               et tracker la consommation de tokens pour les rapports admin
-- ============================================

-- ================================
-- TABLE RATE_LIMITS : Compteur de messages par utilisateur
-- ================================
CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telephone VARCHAR(20) NOT NULL,
  role VARCHAR(20) NOT NULL, -- 'client', 'prestataire', 'onboarding'
  plan VARCHAR(20), -- 'starter', 'pro', 'business' (null pour clients)
  nombre_messages INTEGER DEFAULT 0,
  heure_debut TIMESTAMP NOT NULL,
  limite_horaire INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index pour recherche rapide par téléphone et heure
CREATE INDEX IF NOT EXISTS idx_rate_limits_telephone_heure 
  ON rate_limits(telephone, heure_debut);

-- Index pour nettoyage des anciennes entrées
CREATE INDEX IF NOT EXISTS idx_rate_limits_heure_debut 
  ON rate_limits(heure_debut);

-- ================================
-- TABLE TOKEN_METRICS : Tracking consommation IA
-- ================================
CREATE TABLE IF NOT EXISTS token_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  telephone VARCHAR(20),
  prestataire_id UUID, -- référence vers prestataires
  role VARCHAR(20) NOT NULL, -- 'client', 'prestataire', 'onboarding', 'admin'
  processus VARCHAR(50), -- 'choix_service', 'agenda', 'etape_1', etc.
  tokens_estimes INTEGER DEFAULT 0, -- estimation basée sur longueur
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index pour recherche par date et rôle (rapport admin)
CREATE INDEX IF NOT EXISTS idx_token_metrics_date_role 
  ON token_metrics(date, role);

-- Index pour recherche par prestataire (top 5)
CREATE INDEX IF NOT EXISTS idx_token_metrics_prestataire_date 
  ON token_metrics(prestataire_id, date) 
  WHERE prestataire_id IS NOT NULL;

-- ================================
-- COMMENTAIRES
-- ================================
COMMENT ON TABLE rate_limits IS 'Limites de messages par heure/session pour éviter spam et surconsommation IA';
COMMENT ON TABLE token_metrics IS 'Métriques de consommation IA pour rapports admin et facturation';

COMMENT ON COLUMN rate_limits.role IS 'Type utilisateur: client, prestataire, onboarding';
COMMENT ON COLUMN rate_limits.plan IS 'Plan abonnement prestataire (null pour clients)';
COMMENT ON COLUMN rate_limits.nombre_messages IS 'Nombre de messages envoyés dans la période';
COMMENT ON COLUMN rate_limits.limite_horaire IS 'Limite maximale pour ce rôle/plan';

COMMENT ON COLUMN token_metrics.processus IS 'Processus métier: choix_service, agenda, gestion_rdv, etc.';
COMMENT ON COLUMN token_metrics.tokens_estimes IS 'Estimation tokens consommés (longueur/3.5)';

-- ================================
-- NETTOYAGE AUTOMATIQUE
-- ================================
-- Un CRON job nettoie automatiquement :
-- - rate_limits de plus de 2 heures (chaque heure)
-- - token_metrics peuvent être gardés pour historique ou supprimés manuellement

-- Nettoyage manuel si besoin :
-- DELETE FROM rate_limits WHERE heure_debut < NOW() - INTERVAL '2 hours';
-- DELETE FROM token_metrics WHERE date < CURRENT_DATE - INTERVAL '30 days';

-- ================================
-- VÉRIFICATION
-- ================================
-- Vérifier que les tables ont été créées :
-- SELECT table_name FROM information_schema.tables WHERE table_name IN ('rate_limits', 'token_metrics');
-- SELECT * FROM rate_limits LIMIT 5;
-- SELECT * FROM token_metrics LIMIT 5;
