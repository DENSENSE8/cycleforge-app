-- ============================================================================
-- 2026-09-16_favorite_sku_workspaces_rails.sql
--
-- Favorites become a SCOPE of the catalog picker (the kiosk repair + sales
-- rails land on Favorites and star a tile from its top-right pip), so the
-- workspace vocabulary has to admit every rail that owns a list.
--
-- The baseline created the check as IN ('repair', 'sku-stock') while
-- `FAVORITE_WORKSPACE_KEYS` in src/lib/favorites/favorite-sku-key.ts already
-- shipped 'fba' — an FBA favorite has therefore always been rejected by the
-- DB, silently, at the workspace insert. This widens the constraint to the
-- code's set: repair · sales · sku-stock · fba.
--
-- Idempotent: drops the constraint by name (both the baseline name and the
-- default one Postgres would have chosen) and re-adds it from the current
-- vocabulary. Data-safe — the new set is a superset, so no existing row can
-- fail the re-add.
--
-- Verify:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'favorite_sku_workspaces'::regclass
--      AND contype = 'c';
--   → CHECK (workspace_key IN ('repair', 'sales', 'sku-stock', 'fba'))
-- ============================================================================

DO $$
DECLARE
  c RECORD;
BEGIN
  IF to_regclass('public.favorite_sku_workspaces') IS NULL THEN
    RAISE NOTICE 'favorite_sku_workspaces absent — nothing to widen';
    RETURN;
  END IF;

  FOR c IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'favorite_sku_workspaces'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%workspace_key%'
  LOOP
    EXECUTE format(
      'ALTER TABLE favorite_sku_workspaces DROP CONSTRAINT %I',
      c.conname
    );
    RAISE NOTICE 'dropped workspace_key check %', c.conname;
  END LOOP;

  ALTER TABLE favorite_sku_workspaces
    ADD CONSTRAINT favorite_sku_workspaces_workspace_key_check
    CHECK (workspace_key IN ('repair', 'sales', 'sku-stock', 'fba'));
  RAISE NOTICE 'added workspace_key check (repair, sales, sku-stock, fba)';
END $$;
