-- ============================================================================
-- 2026-09-24: Provisional SKUs carry a description
-- ============================================================================
-- SKU Exceptions (desk `/inventory/sku-exceptions`, phone `/m/on-hold`) let the
-- operator who scanned an unknown product describe it beside the typed title
-- and the photos, so whoever pairs it to the real Zoho SKU later can tell what
-- the box actually held.
--
-- The description lives on the WAREHOUSE row (`sku_stock`) with the other
-- provisional_* facts; `provisional_sku_merges` keeps a copy so the merge
-- record still says what the placeholder was after the row is deleted.
--
-- Safety: nullable columns, no default, no rewrite. Every writer is the
-- provisional query module (org-stamped under withTenantTransaction).
-- Rollback: ALTER TABLE sku_stock DROP COLUMN IF EXISTS provisional_description;
--           ALTER TABLE provisional_sku_merges DROP COLUMN IF EXISTS provisional_description;
-- ============================================================================

BEGIN;

ALTER TABLE sku_stock
  ADD COLUMN IF NOT EXISTS provisional_description TEXT;

COMMENT ON COLUMN sku_stock.provisional_description IS
  'Free-text description of a floor-minted placeholder product (what the box held). NULL on real SKUs.';

ALTER TABLE provisional_sku_merges
  ADD COLUMN IF NOT EXISTS provisional_description TEXT,
  ADD COLUMN IF NOT EXISTS photos_moved INTEGER NOT NULL DEFAULT 0;

COMMIT;
