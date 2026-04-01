-- ================================
-- TABLE DEMANDES_UPGRADE
-- Gérer les demandes de changement de plan ou renouvellement
-- ================================
CREATE TABLE IF NOT EXISTS demandes_upgrade (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prestataire_id UUID NOT NULL REFERENCES prestataires(id) ON DELETE CASCADE,
  plan_actuel VARCHAR(20),
  plan_demande VARCHAR(20),
  type VARCHAR(50) NOT NULL, -- 'upgrade' ou 'renouvellement'
  statut VARCHAR(20) NOT NULL DEFAULT 'en_attente', -- 'en_attente', 'valide', 'refuse'
  messages_utilises INTEGER DEFAULT 0,
  messages_restants INTEGER DEFAULT 7,
  preuve_paiement_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  valide_a TIMESTAMP WITH TIME ZONE,
  valide_par VARCHAR(50)
);

-- Index pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_demandes_upgrade_prestataire ON demandes_upgrade(prestataire_id);
CREATE INDEX IF NOT EXISTS idx_demandes_upgrade_statut ON demandes_upgrade(statut);

-- ================================
-- TABLE CONVERSATIONS_UPGRADE
-- Stocker les messages de la session d'upgrade
-- ================================
CREATE TABLE IF NOT EXISTS conversations_upgrade (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demande_id UUID NOT NULL REFERENCES demandes_upgrade(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL, -- 'user' ou 'assistant'
  contenu TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Index pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_conversations_upgrade_demande ON conversations_upgrade(demande_id);

-- ================================
-- TABLE TENTATIVES_CLIENT_BLOQUE_18H
-- Tracer les tentatives de réservation après 18h (plan Starter)
-- ================================
CREATE TABLE IF NOT EXISTS tentatives_client_apres_18h (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prestataire_id UUID NOT NULL REFERENCES prestataires(id) ON DELETE CASCADE,
  client_telephone VARCHAR(20) NOT NULL,
  nombre_tentatives INTEGER DEFAULT 1,
  derniere_tentative TIMESTAMP WITH TIME ZONE DEFAULT now(),
  notif_prestataire_envoyee BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Index pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_tentatives_18h_prestataire ON tentatives_client_apres_18h(prestataire_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tentatives_18h_unique ON tentatives_client_apres_18h(prestataire_id, client_telephone);
