-- ==============================================================================
-- APPLICATION FAS - SCRIPT SQL : MODULE SONDAGES & VOTES DE POPULARITÉ
-- IMPORTANT : Ce script ne supprime AUCUNE table existante de votre base de données.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TABLE DES PARAMÈTRES GLOBAUX (Activation / Désactivation par l'Admin)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fm_big6_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Activation de RLS pour les paramètres
ALTER TABLE public.fm_big6_settings ENABLE ROW LEVEL SECURITY;

-- Lecture publique de la configuration (permet à l'app de savoir si les votes sont activés)
DROP POLICY IF EXISTS "fm_big6_settings_select" ON public.fm_big6_settings;
CREATE POLICY "fm_big6_settings_select"
    ON public.fm_big6_settings
    FOR SELECT
    USING (true);

-- Modification réservée exclusivement à l'administrateur (admin@admin.fr)
DROP POLICY IF EXISTS "fm_big6_settings_admin" ON public.fm_big6_settings;
CREATE POLICY "fm_big6_settings_admin"
    ON public.fm_big6_settings
    FOR ALL
    TO authenticated
    USING ((auth.jwt() ->> 'email') = 'admin@admin.fr')
    WITH CHECK ((auth.jwt() ->> 'email') = 'admin@admin.fr');

-- Initialisation de la clé d'activation des votes (désactivé par défaut jusqu'à activation admin)
INSERT INTO public.fm_big6_settings (key, value)
VALUES ('votes_module', '{"enabled": false, "show_results": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;


-- ------------------------------------------------------------------------------
-- 2. TABLE DES SONDAGES (Créés et gérés par l'Admin)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fm_big6_polls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    category TEXT NOT NULL DEFAULT 'chef', -- 'chef' | 'rangs' | 'popularite' | 'autre'
    is_active BOOLEAN NOT NULL DEFAULT true,
    allow_self_vote BOOLEAN NOT NULL DEFAULT false, -- Empêche de voter pour soi-même par défaut
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_fm_big6_polls_active ON public.fm_big6_polls (is_active);
CREATE INDEX IF NOT EXISTS idx_fm_big6_polls_created_at ON public.fm_big6_polls (created_at DESC);

-- Activation de RLS
ALTER TABLE public.fm_big6_polls ENABLE ROW LEVEL SECURITY;

-- Lecture publique : Tout le monde peut voir les sondages
DROP POLICY IF EXISTS "fm_big6_polls_select_all" ON public.fm_big6_polls;
CREATE POLICY "fm_big6_polls_select_all"
    ON public.fm_big6_polls
    FOR SELECT
    USING (true);

-- Création réservée exclusivement à l'administrateur
DROP POLICY IF EXISTS "fm_big6_polls_admin_insert" ON public.fm_big6_polls;
CREATE POLICY "fm_big6_polls_admin_insert"
    ON public.fm_big6_polls
    FOR INSERT
    TO authenticated
    WITH CHECK ((auth.jwt() ->> 'email') = 'admin@admin.fr');

-- Modification / clôture réservée exclusivement à l'administrateur
DROP POLICY IF EXISTS "fm_big6_polls_admin_update" ON public.fm_big6_polls;
CREATE POLICY "fm_big6_polls_admin_update"
    ON public.fm_big6_polls
    FOR UPDATE
    TO authenticated
    USING ((auth.jwt() ->> 'email') = 'admin@admin.fr')
    WITH CHECK ((auth.jwt() ->> 'email') = 'admin@admin.fr');

-- Suppression réservée exclusivement à l'administrateur
DROP POLICY IF EXISTS "fm_big6_polls_admin_delete" ON public.fm_big6_polls;
CREATE POLICY "fm_big6_polls_admin_delete"
    ON public.fm_big6_polls
    FOR DELETE
    TO authenticated
    USING ((auth.jwt() ->> 'email') = 'admin@admin.fr');


-- ------------------------------------------------------------------------------
-- 3. TABLE DES VOTES (1 vote par joueur connecté par sondage)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fm_big6_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES public.fm_big6_polls(id) ON DELETE CASCADE,
    voter_pseudo TEXT NOT NULL,
    voter_pseudo_normalized TEXT NOT NULL,
    candidate_id UUID REFERENCES public.fm_big6_players(id) ON DELETE SET NULL,
    candidate_pseudo TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Contrainte d'unicité : un votant ne peut voter qu'une seule fois par sondage
    CONSTRAINT fm_big6_votes_unique_voter_poll UNIQUE (poll_id, voter_pseudo_normalized)
);

-- Index pour accélérer le comptage et la recherche des votes
CREATE INDEX IF NOT EXISTS idx_fm_big6_votes_poll ON public.fm_big6_votes (poll_id);
CREATE INDEX IF NOT EXISTS idx_fm_big6_votes_voter ON public.fm_big6_votes (voter_pseudo_normalized);
CREATE INDEX IF NOT EXISTS idx_fm_big6_votes_candidate ON public.fm_big6_votes (candidate_pseudo);

-- Activation de RLS
ALTER TABLE public.fm_big6_votes ENABLE ROW LEVEL SECURITY;

-- Lecture publique : Tout le monde peut voir les votes pour calculer les résultats
DROP POLICY IF EXISTS "fm_big6_votes_select_all" ON public.fm_big6_votes;
CREATE POLICY "fm_big6_votes_select_all"
    ON public.fm_big6_votes
    FOR SELECT
    USING (true);

-- Insertion publique : N'importe quel joueur peut enregistrer son vote
DROP POLICY IF EXISTS "fm_big6_votes_insert_all" ON public.fm_big6_votes;
CREATE POLICY "fm_big6_votes_insert_all"
    ON public.fm_big6_votes
    FOR INSERT
    WITH CHECK (true);

-- Mise à jour publique : Un joueur peut modifier son vote
DROP POLICY IF EXISTS "fm_big6_votes_update_all" ON public.fm_big6_votes;
CREATE POLICY "fm_big6_votes_update_all"
    ON public.fm_big6_votes
    FOR UPDATE
    USING (true)
    WITH CHECK (true);

-- Suppression : Permet d'annuler son vote ou à l'admin de réinitialiser
DROP POLICY IF EXISTS "fm_big6_votes_delete_all" ON public.fm_big6_votes;
CREATE POLICY "fm_big6_votes_delete_all"
    ON public.fm_big6_votes
    FOR DELETE
    USING (true);


-- ------------------------------------------------------------------------------
-- 4. DÉCLENCHEURS DE MISE À JOUR DE 'updated_at'
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS tr_fm_big6_polls_updated_at ON public.fm_big6_polls;
CREATE TRIGGER tr_fm_big6_polls_updated_at
    BEFORE UPDATE ON public.fm_big6_polls
    FOR EACH ROW
    EXECUTE FUNCTION public.update_fm_big6_timestamp();

DROP TRIGGER IF EXISTS tr_fm_big6_votes_updated_at ON public.fm_big6_votes;
CREATE TRIGGER tr_fm_big6_votes_updated_at
    BEFORE UPDATE ON public.fm_big6_votes
    FOR EACH ROW
    EXECUTE FUNCTION public.update_fm_big6_timestamp();


-- ------------------------------------------------------------------------------
-- 5. EXEMPLES DE SONDAGES PRÉ-CONFIGURÉS (Optionnel, inséré seulement si la table est vide)
-- ------------------------------------------------------------------------------
INSERT INTO public.fm_big6_polls (title, description, category, is_active, allow_self_vote)
SELECT 
    '👑 Élection du Chef de Clan',
    'Votez pour le joueur qui représentera et dirigera notre clan !',
    'chef',
    true,
    false
WHERE NOT EXISTS (SELECT 1 FROM public.fm_big6_polls LIMIT 1);
