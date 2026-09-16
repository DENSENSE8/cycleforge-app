-- ============================================================================
-- 2026-09-13c: Provisional SKUs, part 2 — they need a sku_catalog row
-- ============================================================================
-- CORRECTS the design stated in 2026-09-13b's header.
--
-- That migration claimed a provisional could live as a `sku_stock` row alone,
-- and that having no `sku_catalog` row would keep it off every channel path
-- "by construction". The database says otherwise:
--
--   bin_contents.sku → sku_catalog(sku)  ON UPDATE CASCADE ON DELETE RESTRICT
--   (2026-04-09_rename_zone_to_room.sql:27-30)
--
-- A SKU with no catalog row cannot be put in a bin at all, which is the one
-- thing a placeholder exists to allow. So a provisional gets a catalog row
-- too, and the exclusion becomes explicit rather than structural.
--
-- ─── WHAT STILL KEEPS IT OFF THE CHANNELS ──────────────────────────────────
-- Three independent guards, because this is now a promise the schema does not
-- keep for us:
--
--   1. `sku_catalog.is_provisional = true` — the explicit flag, and the one
--      any outbound query should test.
--   2. `sku_catalog.is_active = false` — provisionals are inactive from birth,
--      so every existing path already filtering on `is_active` (the partial
--      index `idx_sku_catalog_active` exists precisely because those paths are
--      the common case) excludes them without being modified.
--   3. No `sku_platform_ids` row and no Zoho `items` mirror row — so
--      `searchFromPlatform` (INNER JOINs sku_platform_ids WHERE platform =
--      'ecwid') and `searchFromZohoCatalog` (INNER JOINs the items mirror)
--      cannot return one even if 1 and 2 were both forgotten.
--
-- Guard 3 is the one that survives future edits, because it holds by absence
-- rather than by a predicate somebody has to remember to write.
--
-- ─── DELETION ──────────────────────────────────────────────────────────────
-- ON DELETE RESTRICT means the provisional's catalog row cannot be removed
-- while any bin still references it. That is the correct order anyway: the
-- merge moves every bin row onto the target first, and only then drops the
-- placeholder. The constraint enforces the sequencing for us.
-- ============================================================================

BEGIN;

ALTER TABLE sku_catalog
  ADD COLUMN IF NOT EXISTS is_provisional      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS provisional_barcode TEXT;

COMMENT ON COLUMN sku_catalog.is_provisional IS
  'Floor-minted placeholder. Never export, list, or allocate. Paired with is_active = false.';

-- The "do not ship this" list, and a cheap negation for outbound queries.
CREATE INDEX IF NOT EXISTS idx_sku_catalog_provisional
  ON sku_catalog (organization_id, sku)
  WHERE is_provisional = true;

COMMIT;
