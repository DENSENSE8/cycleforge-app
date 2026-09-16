-- 2026-09-15b_platform_listing_price_keys.sql
--
-- PER-PLATFORM PRICE BECOMES JOINABLE.
--
-- ## The problem this fixes
--
-- Price never displays on an order. Measured 2026-09-14 (org USAV):
--
--   orders                                  4467
--   orders with sale_amount                    6   ← 0.1%
--   platform_listings rows                  1557   ← all priced, all 'ecwid'
--   platform_listings with sku_catalog_id      0   ← the join key is EMPTY
--
-- So there are two price stores and no path between them and an order line.
-- `platform_listings` is the right table — (platform, account, merchant_sku,
-- listing_price_cents, listing_condition) is exactly per-platform-per-price —
-- but its only writer is the kiosk/repair catalog projection
-- (`repair/catalog-projection.ts`), which upserts on
-- (organization_id, platform, external_ref_id) and never populates
-- `sku_catalog_id`. Nothing can join an order to a price.
--
-- ## Why key on a normalized merchant_sku and not just fix the FK
--
-- Only 177 of the 1557 listings match a `sku_catalog` row by SKU today, so an
-- FK-only path would price ~11% of the catalog and leave the rest dark. The
-- item number the floor and the marketplaces actually speak is the merchant
-- SKU string, and it arrives with inconsistent case and padding from every
-- source. A STORED generated column makes the normalized form indexable, so
-- the resolver joins on `upper(btrim(...))` without a per-query function scan
-- over 1557+ rows (and without every caller remembering to normalize — the
-- omission that made `orders.sku` ↔ `serial_units.sku` matching unreliable
-- elsewhere in this schema).
--
-- ## Why the unique index matters more than it looks
--
-- The table had NO uniqueness on (org, platform, account, merchant_sku): only
-- a partial unique on external_ref_id. Two catalog syncs that re-key a product
-- (Ecwid product deleted and recreated → new external_ref_id, same SKU) would
-- therefore create a SECOND priced row for one item number, and a price
-- resolver would pick one at random. Preflight: 0 duplicate groups today, so
-- the index is free to add and locks in that property.
--
-- ## Scope
--
-- Keys and a backfill only. NO new price table: the three price facts already
-- have homes and must not be merged —
--   asking price per platform  → platform_listings.listing_price_cents
--   sold price per order line  → orders.sale_amount (+ currency)
--   price for ONE serial unit  → serial_unit_listings.listing_price_cents
-- A single "price" column would collapse a repriced listing into historical
-- revenue and lie about both.
--
-- Idempotent: IF NOT EXISTS throughout, and the backfill is WHERE ... IS NULL.

BEGIN;

-- ─── 1. Normalized item number, indexable ───────────────────────────────────

ALTER TABLE platform_listings
  ADD COLUMN IF NOT EXISTS merchant_sku_normalized TEXT
  GENERATED ALWAYS AS (UPPER(BTRIM(merchant_sku))) STORED;

COMMENT ON COLUMN platform_listings.merchant_sku_normalized IS
  'Generated UPPER(BTRIM(merchant_sku)). Join key for order-line price resolution; never written directly.';

CREATE INDEX IF NOT EXISTS idx_platform_listings_org_msku_norm
  ON platform_listings (organization_id, merchant_sku_normalized)
  WHERE merchant_sku_normalized IS NOT NULL;

-- ─── 2. One price per (platform, account, item number) ──────────────────────

DO $$
DECLARE
  dupe_groups INTEGER;
BEGIN
  SELECT COUNT(*) INTO dupe_groups FROM (
    SELECT 1
      FROM platform_listings
     WHERE merchant_sku_normalized IS NOT NULL
     GROUP BY organization_id, platform, COALESCE(platform_account_id, 0), merchant_sku_normalized
    HAVING COUNT(*) > 1
  ) d;

  IF dupe_groups > 0 THEN
    RAISE EXCEPTION 'REFUSING: % (org, platform, account, merchant_sku) group(s) already hold more than one listing. Dedupe (keep newest last_synced_at) before adding the unique index.', dupe_groups;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_platform_listings_org_platform_acct_msku
  ON platform_listings (organization_id, platform, COALESCE(platform_account_id, 0), merchant_sku_normalized)
  WHERE merchant_sku_normalized IS NOT NULL;

-- ─── 3. Backfill the catalog FK where it is unambiguous ─────────────────────

CREATE INDEX IF NOT EXISTS idx_platform_listings_org_catalog
  ON platform_listings (organization_id, sku_catalog_id)
  WHERE sku_catalog_id IS NOT NULL;

DO $$
DECLARE
  ambiguous INTEGER;
  linked    INTEGER;
  unlinked  INTEGER;
BEGIN
  -- A merchant SKU that matches two catalog rows is a catalog problem, not a
  -- backfill candidate — assigning one at random would mislabel the product.
  SELECT COUNT(*) INTO ambiguous FROM (
    SELECT p.id
      FROM platform_listings p
      JOIN sku_catalog c
        ON UPPER(BTRIM(c.sku)) = p.merchant_sku_normalized
       AND c.organization_id = p.organization_id
     WHERE p.sku_catalog_id IS NULL
     GROUP BY p.id
    HAVING COUNT(DISTINCT c.id) > 1
  ) a;

  IF ambiguous > 0 THEN
    RAISE EXCEPTION 'REFUSING BACKFILL: % listing(s) match more than one sku_catalog row by SKU. Resolve the catalog duplicates first.', ambiguous;
  END IF;

  UPDATE platform_listings p
     SET sku_catalog_id = c.id,
         updated_at = now()
    FROM sku_catalog c
   WHERE p.sku_catalog_id IS NULL
     AND c.organization_id = p.organization_id
     AND UPPER(BTRIM(c.sku)) = p.merchant_sku_normalized;

  GET DIAGNOSTICS linked = ROW_COUNT;

  SELECT COUNT(*) INTO unlinked
    FROM platform_listings WHERE sku_catalog_id IS NULL;

  -- Not an error: a listing for an item the internal catalog has never carried
  -- is normal, and the resolver still prices it off merchant_sku_normalized.
  RAISE NOTICE 'linked % listing(s) to sku_catalog; % still unlinked (priced via merchant_sku)', linked, unlinked;
END $$;

COMMIT;
