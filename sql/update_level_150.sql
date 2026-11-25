-- ==============================================================================
-- APPLICATION FAS - MIGRATION NIVEAU 150 (ASCENSION 3) & NOUVEAUX PLAFONDS
-- À exécuter dans Supabase > SQL Editor (idempotent, sans perte de données)
-- ==============================================================================

DO $$
DECLARE
    r RECORD;
BEGIN
    -- Supprimer les anciennes contraintes CHECK sur les colonnes concernées
    FOR r IN
        SELECT DISTINCT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
        WHERE n.nspname = 'public'
          AND t.relname = 'fm_big6_players'
          AND c.contype = 'c'
          AND a.attname IN (
              'skills_ascension_level',
              'eggs_ascension_level',
              'mount_ascension_level',
              'skills_tickets',
              'eggs_count',
              'mount_keys'
          )
    LOOP
        EXECUTE format('ALTER TABLE public.fm_big6_players DROP CONSTRAINT IF EXISTS %I', r.conname);
    END LOOP;
END $$;

-- Nouveaux plafonds de niveau (0 à 150 pour permettre 101-150 en Ascension 3)
ALTER TABLE public.fm_big6_players
    ADD CONSTRAINT fm_big6_players_skills_ascension_level_check
    CHECK (skills_ascension_level >= 0 AND skills_ascension_level <= 150);

ALTER TABLE public.fm_big6_players
    ADD CONSTRAINT fm_big6_players_eggs_ascension_level_check
    CHECK (eggs_ascension_level >= 0 AND eggs_ascension_level <= 150);

ALTER TABLE public.fm_big6_players
    ADD CONSTRAINT fm_big6_players_mount_ascension_level_check
    CHECK (mount_ascension_level >= 0 AND mount_ascension_level <= 150);

-- Nouveaux plafonds de ressources (2M tickets, 1.5M œufs, 1M clés)
ALTER TABLE public.fm_big6_players
    ADD CONSTRAINT fm_big6_players_skills_tickets_check
    CHECK (skills_tickets >= 0 AND skills_tickets <= 2000000);

ALTER TABLE public.fm_big6_players
    ADD CONSTRAINT fm_big6_players_eggs_count_check
    CHECK (eggs_count >= 0 AND eggs_count <= 1500000);

ALTER TABLE public.fm_big6_players
    ADD CONSTRAINT fm_big6_players_mount_keys_check
    CHECK (mount_keys >= 0 AND mount_keys <= 1000000);
