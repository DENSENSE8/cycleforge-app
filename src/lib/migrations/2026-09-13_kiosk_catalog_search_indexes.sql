-- ============================================================================
-- 2026-09-13: index the catalog projection for the kiosk product searcher
-- ============================================================================
-- The kiosk counter is the in-person product searcher: a walk-in asks "do you
-- have this", and the staffer must answer price + on-hand + which bin to walk
-- to before the customer loses interest. That search now runs in SQL over
-- `platform_listings` (the local Ecwid projection written by
-- `projectEcwidCatalog`) instead of shipping the whole table to the client and
-- filtering the first 100 rows in JS.
--
-- Three access shapes need support, and none of them had an index:
--
--   1. `listed_name ILIKE '%q%'` + `similarity(listed_name, q)` — the typo-
--      tolerant name search. Needs gin_trgm_ops; a btree cannot serve a
--      leading-wildcard ILIKE and pg_trgm's GIN opclass accelerates both the
--      ILIKE and the similarity()/word_similarity() arms.
--   2. `merchant_sku ILIKE 'q%' / '%q%'` and the `-RS` service/retail split
--      (`merchant_sku ~* '(-RS|-RS-[0-9]+)$'`) — also leading-wildcard, so
--      also trigram.
--   3. `upc = $1` — the barcode wedge's exact identity lookup. Plain btree.
--
-- pg_trgm is already installed (2026-04-02_enable_pg_trgm_for_shipped_search,
-- re-asserted by 2026-07-03d_entity_search_docs); the CREATE EXTENSION here is
-- the same idempotent guard those migrations use, so this file can be applied
-- against a fresh database without ordering assumptions.
--
-- Every index is partial on `is_active` to match the reader's own predicate —
-- `searchKioskCatalog` never serves a deactivated listing, and the projection
-- soft-deactivates rather than deleting, so the inactive tail would otherwise
-- grow in every index forever.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Name search (ILIKE + trigram similarity).
CREATE INDEX IF NOT EXISTS idx_platform_listings_listed_name_trgm
  ON platform_listings USING gin (listed_name gin_trgm_ops)
  WHERE is_active;

-- 2. SKU search (ILIKE prefix/contains + the -RS regex split).
CREATE INDEX IF NOT EXISTS idx_platform_listings_merchant_sku_trgm
  ON platform_listings USING gin (merchant_sku gin_trgm_ops)
  WHERE is_active;

-- 3. Barcode identity lookup from the HID wedge.
CREATE INDEX IF NOT EXISTS idx_platform_listings_upc
  ON platform_listings (organization_id, upc)
  WHERE is_active AND upc IS NOT NULL;

-- 4. The unfiltered browse/category page: ORDER BY listed_name within an org's
--    projection. Without this the "All products" grid sorts the whole
--    projection on every page request.
CREATE INDEX IF NOT EXISTS idx_platform_listings_org_platform_name
  ON platform_listings (organization_id, platform, listed_name)
  WHERE is_active;

COMMENT ON INDEX idx_platform_listings_listed_name_trgm IS
  'Kiosk product searcher: typo-tolerant name search (ILIKE %q% + similarity). Partial on is_active to match searchKioskCatalog.';
COMMENT ON INDEX idx_platform_listings_upc IS
  'Kiosk barcode wedge: exact UPC identity lookup from a scanned retail barcode.';
