-- ==============================================================================
-- APPLICATION FM BIG 6 - SCRIPT D'INITIALISATION SUPABASE
-- IMPORTANT : Ce script ne supprime AUCUNE table existante de votre base de données.
-- Il crée uniquement la table dédiée "fm_big6_players" et configure sa sécurité.
-- ==============================================================================

-- 1. Création de la table 'fm_big6_players'
CREATE TABLE IF NOT EXISTS public.fm_big6_players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pseudo TEXT NOT NULL,
    pseudo_normalized TEXT GENERATED ALWAYS AS (LOWER(TRIM(pseudo))) STORED,
    
    -- Compétences (Tickets FM)
    skills_tickets INTEGER NOT NULL DEFAULT 0 CHECK (skills_tickets >= 0 AND skills_tickets <= 500000),
    skills_ascension INTEGER NOT NULL DEFAULT 0 CHECK (skills_ascension >= 0 AND skills_ascension <= 3),
    skills_ascension_level INTEGER NOT NULL DEFAULT 0 CHECK (skills_ascension_level >= 0 AND skills_ascension_level <= 100),
    skills_tech_level INTEGER NOT NULL DEFAULT 0 CHECK (skills_tech_level >= 0 AND skills_tech_level <= 5),
    
    -- Œufs (oeufs FM)
    eggs_count INTEGER NOT NULL DEFAULT 0 CHECK (eggs_count >= 0 AND eggs_count <= 200000),
    eggs_ascension INTEGER NOT NULL DEFAULT 0 CHECK (eggs_ascension >= 0 AND eggs_ascension <= 3),
    eggs_ascension_level INTEGER NOT NULL DEFAULT 0 CHECK (eggs_ascension_level >= 0 AND eggs_ascension_level <= 100),
    eggs_tech_level INTEGER NOT NULL DEFAULT 0 CHECK (eggs_tech_level >= 0 AND eggs_tech_level <= 5),
    
    -- Monture (Monture FM)
    mount_keys INTEGER NOT NULL DEFAULT 0 CHECK (mount_keys >= 0 AND mount_keys <= 200000),
    mount_ascension INTEGER NOT NULL DEFAULT 0 CHECK (mount_ascension >= 0 AND mount_ascension <= 3),
    mount_ascension_level INTEGER NOT NULL DEFAULT 0 CHECK (mount_ascension_level >= 0 AND mount_ascension_level <= 100),
    mount_tech_level INTEGER NOT NULL DEFAULT 0 CHECK (mount_tech_level >= 0 AND mount_tech_level <= 5),
    
    -- Forge (Forge FM)
    forge_hammers INTEGER NOT NULL DEFAULT 0 CHECK (forge_hammers >= 0 AND forge_hammers <= 500000),
    forge_ascension INTEGER NOT NULL DEFAULT 0 CHECK (forge_ascension >= 0 AND forge_ascension <= 3),
    forge_ascension_level INTEGER NOT NULL DEFAULT 0 CHECK (forge_ascension_level >= 0 AND forge_ascension_level <= 35),
    forge_tech_level INTEGER NOT NULL DEFAULT 0 CHECK (forge_tech_level >= 0 AND forge_tech_level <= 5),
    
    -- Dates de suivi
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Contrainte d'unicité sur le pseudo (insensible à la casse)
    CONSTRAINT fm_big6_players_pseudo_unique UNIQUE (pseudo_normalized)
);

-- Index pour optimiser les requêtes de recherche et classement
CREATE INDEX IF NOT EXISTS idx_fm_big6_players_pseudo ON public.fm_big6_players (pseudo_normalized);
CREATE INDEX IF NOT EXISTS idx_fm_big6_players_updated_at ON public.fm_big6_players (updated_at DESC);

-- 2. Activation de la sécurité Row Level Security (RLS)
ALTER TABLE public.fm_big6_players ENABLE ROW LEVEL SECURITY;

-- 3. Configuration des politiques RLS

-- Lecture publique : Tout le monde peut voir les classements
DROP POLICY IF EXISTS "fm_big6_select_all" ON public.fm_big6_players;
CREATE POLICY "fm_big6_select_all"
    ON public.fm_big6_players
    FOR SELECT
    USING (true);

-- Insertion publique : N'importe quel joueur peut enregistrer ses scores
DROP POLICY IF EXISTS "fm_big6_insert_all" ON public.fm_big6_players;
CREATE POLICY "fm_big6_insert_all"
    ON public.fm_big6_players
    FOR INSERT
    WITH CHECK (true);

-- Mise à jour publique : Les scores existants peuvent être mis à jour par pseudo
DROP POLICY IF EXISTS "fm_big6_update_all" ON public.fm_big6_players;
CREATE POLICY "fm_big6_update_all"
    ON public.fm_big6_players
    FOR UPDATE
    USING (true)
    WITH CHECK (true);

-- Suppression réservée EXCLUSIVEMENT au compte administrateur (admin@admin.fr)
DROP POLICY IF EXISTS "fm_big6_delete_admin" ON public.fm_big6_players;
CREATE POLICY "fm_big6_delete_admin"
    ON public.fm_big6_players
    FOR DELETE
    TO authenticated
    USING ((auth.jwt() ->> 'email') = 'admin@admin.fr');

-- 4. Fonction et déclencheur (trigger) pour mettre à jour automatiquement 'updated_at'
CREATE OR REPLACE FUNCTION public.update_fm_big6_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_fm_big6_updated_at ON public.fm_big6_players;
CREATE TRIGGER tr_fm_big6_updated_at
    BEFORE UPDATE ON public.fm_big6_players
    FOR EACH ROW
    EXECUTE FUNCTION public.update_fm_big6_timestamp();
