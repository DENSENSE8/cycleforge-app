-- ============================================================================
-- 2026-10-05_sku_catalog_mpn.sql
--
-- WHAT: sku_catalog.mpn — the manufacturer part number for a catalog product,
-- plus an org-scoped normalized lookup index.
--
-- WHY: prepack step 1 identifies the PRODUCT (not the unit). Operators read
-- the MPN off the box/label; the catalog search matches it exactly and ranks
-- it right after an exact SKU/GTIN hit. The MPN is owned by the CycleForge
-- catalog — it is product identity, never per-unit, and never edits title or
-- image (sku-identity law: the provider item governs those).
--
-- NO BACKFILL. NULL/'' = not recorded. Not unique: distinct SKUs (condition
-- variants, bundles) legitimately share one MPN.
--
-- SAFETY: additive, nullable, no default; existing writers omit the column.
-- sku_catalog already carries organization_id with FORCE RLS. The index is
-- partial (only rows with an MPN) and matches the search predicate
-- UPPER(BTRIM(mpn)) = UPPER(BTRIM($q)).
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_sku_catalog_org_mpn;
--   ALTER TABLE sku_catalog DROP COLUMN IF EXISTS mpn;
--
-- VERIFY:
--   \d+ sku_catalog                     -- mpn text, nullable; idx_sku_catalog_org_mpn
--   SELECT COUNT(*) FROM sku_catalog WHERE mpn IS NOT NULL;  -- 0 after apply
-- ============================================================================

BEGIN;

ALTER TABLE sku_catalog ADD COLUMN IF NOT EXISTS mpn TEXT;

CREATE INDEX IF NOT EXISTS idx_sku_catalog_org_mpn
  ON sku_catalog (organization_id, UPPER(BTRIM(mpn)))
  WHERE mpn IS NOT NULL AND mpn <> '';

COMMENT ON COLUMN sku_catalog.mpn IS
  'Manufacturer part number, owned by the CycleForge catalog. Product identity (never per-unit); NULL = not recorded. Not unique across SKUs.';

COMMIT;
