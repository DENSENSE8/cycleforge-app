-- ============================================================================
-- 2026-09-26_brands_3_items_zoho_brand.sql — items.brand / items.manufacturer
-- ============================================================================
-- Sidebar Phase 1. Zoho Inventory returns `brand` and `manufacturer` as
-- native string fields on the item object; the mirror dropped both
-- (phase0-findings §Brand, source #1: InventorySyncService mapper). The SKU
-- identity law says the Zoho item governs — for brand as for title — so the
-- mirror keeps them verbatim; ZOHO_ITEM_BRAND_SQL / resolveSkuIdentityBrand
-- read them first and scripts/brands-backfill.ts maps them to
-- sku_catalog.brand_id at confidence 1.00.
--
-- Plain nullable TEXT (Zoho's own free text), no CHECK. No index: reads go
-- through the existing sku/zoho_item_id keys.
--
-- Safety gating: additive nullable columns; items is already FORCE-RLS'd.
-- The only writer (upsertItem in src/lib/repositories/itemRepository.ts,
-- driven by InventorySyncService) starts writing them in the same change.
-- Values stay NULL until the next Zoho full sync (`fullSync`,
-- InventorySyncService, filter_by Status.All).
--
-- ROLLBACK:
--   ALTER TABLE items DROP COLUMN IF EXISTS manufacturer, DROP COLUMN IF EXISTS brand;
--   (and revert the mapper/upsert change first, or the sync will fail)
--
-- VERIFY (after apply + a full sync):
--   SELECT count(*) FILTER (WHERE NULLIF(btrim(brand), '') IS NOT NULL) AS with_brand,
--          count(*) FILTER (WHERE NULLIF(btrim(manufacturer), '') IS NOT NULL) AS with_mfr,
--          count(*) AS total
--     FROM items;
-- ============================================================================

BEGIN;

ALTER TABLE items ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS manufacturer TEXT;

COMMENT ON COLUMN items.brand IS 'Zoho item native `brand` (verbatim mirror). The Zoho item governs SKU brand identity.';
COMMENT ON COLUMN items.manufacturer IS 'Zoho item native `manufacturer` (verbatim mirror); brand fallback.';

COMMIT;
