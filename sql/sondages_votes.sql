-- ==============================================================================
-- APPLICATION FAS - SCRIPT SQL : MODULE SONDAGES & VOTES DE POPULARITÉ (V2)
-- IMPORTANT : Ce script ne supprime AUCUNE table existante de votre base de données.
-- Supporte : Jusqu'à 5 votes par joueur, 2 degrés (R5 / Dirigeant), classement Réel.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TABLE DES PARAMÈTRES GLOBAUX (Activation / Désactivation par l'Admin)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fm_big6_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fm_big6_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fm_big6_settings_select" ON public.fm_big6_settings;
CREATE POLICY "fm_big6_settings_select" ON public.fm_big6_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "fm_big6_settings_admin" ON public.fm_big6_settings;
CREATE POLICY "fm_big6_settings_admin" ON public.fm_big6_settings FOR ALL TO authenticated
    USING ((auth.jwt() ->> 'email') = 'admin@admin.fr')
    WITH CHECK ((auth.jwt() ->> 'email') = 'admin@admin.fr');

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
    allow_self_vote BOOLEAN NOT NULL DEFAULT false,
    max_votes INTEGER NOT NULL DEFAULT 5, -- Nombre max de personnes qu'un joueur peut choisir (défaut: 5)
    role_options TEXT[] NOT NULL DEFAULT ARRAY['Dirigeant', 'R5'], -- Les 2 degrés de rôle
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Si la table existait déjà, ajout sécurisé des nouvelles colonnes
ALTER TABLE public.fm_big6_polls ADD COLUMN IF NOT EXISTS max_votes INTEGER NOT NULL DEFAULT 5;
ALTER TABLE public.fm_big6_polls ADD COLUMN IF NOT EXISTS role_options TEXT[] NOT NULL DEFAULT ARRAY['Dirigeant', 'R5'];

CREATE INDEX IF NOT EXISTS idx_fm_big6_polls_active ON public.fm_big6_polls (is_active);
CREATE INDEX IF NOT EXISTS idx_fm_big6_polls_created_at ON public.fm_big6_polls (created_at DESC);

ALTER TABLE public.fm_big6_polls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fm_big6_polls_select_all" ON public.fm_big6_polls;
CREATE POLICY "fm_big6_polls_select_all" ON public.fm_big6_polls FOR SELECT USING (true);

DROP POLICY IF EXISTS "fm_big6_polls_admin_insert" ON public.fm_big6_polls;
CREATE POLICY "fm_big6_polls_admin_insert" ON public.fm_big6_polls FOR INSERT TO authenticated
    WITH CHECK ((auth.jwt() ->> 'email') = 'admin@admin.fr');

DROP POLICY IF EXISTS "fm_big6_polls_admin_update" ON public.fm_big6_polls;
CREATE POLICY "fm_big6_polls_admin_update" ON public.fm_big6_polls FOR UPDATE TO authenticated
    USING ((auth.jwt() ->> 'email') = 'admin@admin.fr')
    WITH CHECK ((auth.jwt() ->> 'email') = 'admin@admin.fr');

DROP POLICY IF EXISTS "fm_big6_polls_admin_delete" ON public.fm_big6_polls;
CREATE POLICY "fm_big6_polls_admin_delete" ON public.fm_big6_polls FOR DELETE TO authenticated
    USING ((auth.jwt() ->> 'email') = 'admin@admin.fr');


-- ------------------------------------------------------------------------------
-- 3. TABLE DES VOTES (Jusqu'à 5 votes par joueur, 1 vote par personne, avec rôle Dirigeant/R5)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fm_big6_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES public.fm_big6_polls(id) ON DELETE CASCADE,
    voter_pseudo TEXT NOT NULL,
    voter_pseudo_normalized TEXT NOT NULL,
    candidate_id UUID REFERENCES public.fm_big6_players(id) ON DELETE SET NULL,
    candidate_pseudo TEXT NOT NULL,
    vote_role TEXT NOT NULL DEFAULT 'R5', -- Degré de vote: 'Dirigeant' ou 'R5'
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Si la table existait déjà, ajout du rôle de vote
ALTER TABLE public.fm_big6_votes ADD COLUMN IF NOT EXISTS vote_role TEXT NOT NULL DEFAULT 'R5';

-- Remplacement de la contrainte d'unicité :
-- Un votant peut voter pour plusieurs personnes (jusqu'à 5), mais 1 seule fois par candidat dans un sondage
ALTER TABLE public.fm_big6_votes DROP CONSTRAINT IF EXISTS fm_big6_votes_unique_voter_poll;
ALTER TABLE public.fm_big6_votes DROP CONSTRAINT IF EXISTS fm_big6_votes_unique_voter_candidate;
ALTER TABLE public.fm_big6_votes ADD CONSTRAINT fm_big6_votes_unique_voter_candidate UNIQUE (poll_id, voter_pseudo_normalized, candidate_pseudo);

CREATE INDEX IF NOT EXISTS idx_fm_big6_votes_poll ON public.fm_big6_votes (poll_id);
CREATE INDEX IF NOT EXISTS idx_fm_big6_votes_voter ON public.fm_big6_votes (voter_pseudo_normalized);
CREATE INDEX IF NOT EXISTS idx_fm_big6_votes_candidate ON public.fm_big6_votes (candidate_pseudo);
CREATE INDEX IF NOT EXISTS idx_fm_big6_votes_role ON public.fm_big6_votes (vote_role);

ALTER TABLE public.fm_big6_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fm_big6_votes_select_all" ON public.fm_big6_votes;
CREATE POLICY "fm_big6_votes_select_all" ON public.fm_big6_votes FOR SELECT USING (true);

DROP POLICY IF EXISTS "fm_big6_votes_insert_all" ON public.fm_big6_votes;
CREATE POLICY "fm_big6_votes_insert_all" ON public.fm_big6_votes FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "fm_big6_votes_update_all" ON public.fm_big6_votes;
CREATE POLICY "fm_big6_votes_update_all" ON public.fm_big6_votes FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "fm_big6_votes_delete_all" ON public.fm_big6_votes;
CREATE POLICY "fm_big6_votes_delete_all" ON public.fm_big6_votes FOR DELETE USING (true);


-- ------------------------------------------------------------------------------
-- 4. DÉCLENCHEURS DE MISE À JOUR DE 'updated_at'
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS tr_fm_big6_polls_updated_at ON public.fm_big6_polls;
CREATE TRIGGER tr_fm_big6_polls_updated_at
    BEFORE UPDATE ON public.fm_big6_polls
    FOR EACH ROW EXECUTE FUNCTION public.update_fm_big6_timestamp();

DROP TRIGGER IF EXISTS tr_fm_big6_votes_updated_at ON public.fm_big6_votes;
CREATE TRIGGER tr_fm_big6_votes_updated_at
    BEFORE UPDATE ON public.fm_big6_votes
    FOR EACH ROW EXECUTE FUNCTION public.update_fm_big6_timestamp();
