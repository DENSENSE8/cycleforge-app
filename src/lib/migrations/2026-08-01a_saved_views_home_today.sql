-- ============================================================================
-- 2026-08-01a — saved_views: admit the Home → Today surface (`home_today`)
--
-- WHY: Today (`/`, the MyDayWorkspace region) grew a left context panel with
-- saved views (chrome parity slice 1). `useSavedViews` resolves its storage key
-- to the DB discriminator `home_today`, which the birth migration's CHECK does
-- not list — so without this the surface's FIRST insert 23514s, and the only
-- symptom in the UI is a Save button that silently does nothing.
--
-- SHAPE: DROP then re-ADD with the **full union**, not an incremental edit.
-- `.claude/rules/polymorphic-tables.md` records the reason: five migrations
-- edited `reason_codes_flow_context_chk` and several dropped values an earlier
-- one had added — the union survived only because the last-sorting filename
-- happened to re-affirm everything. A CHECK is redefined, never appended to, so
-- the last-sorting definition must be the whole truth on its own.
--
-- Keep in lockstep with SAVED_VIEW_SURFACES in src/lib/saved-views/surfaces.ts
-- (pinned by src/lib/saved-views/surfaces.test.ts, which resolves the EFFECTIVE
-- CHECK as the last-sorting migration that defines it).
--
-- ROLLBACK (dev only):
--   ALTER TABLE saved_views DROP CONSTRAINT IF EXISTS saved_views_surface_chk;
--   DELETE FROM saved_views WHERE surface = 'home_today';
--   -- then re-ADD the 10-value union from 2026-07-29g.
--
-- VERIFY:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'saved_views_surface_chk';
-- ============================================================================

BEGIN;

ALTER TABLE saved_views DROP CONSTRAINT IF EXISTS saved_views_surface_chk;

DO $$ BEGIN
  ALTER TABLE saved_views ADD CONSTRAINT saved_views_surface_chk
    CHECK (surface IN (
      'operations',
      'media_library',
      'dashboard_unshipped',
      'dashboard_packed',
      'dashboard_shipped',
      'tech_history',
      'packer_history',
      'receiving_history',
      'receiving_incoming',
      'testing_history',
      'home_today'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
