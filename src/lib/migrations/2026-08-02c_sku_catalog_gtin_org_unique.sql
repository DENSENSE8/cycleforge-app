-- ============================================================================
-- 2026-08-02c_sku_catalog_gtin_org_unique.sql
--
-- sku_catalog.gtin — make the uniqueness PER ORG, not global.
--
-- WHY THIS IS A BUG AND NOT A PREFERENCE.
-- `idx_sku_catalog_gtin` (2026-05-14) is `UNIQUE (gtin)` across the whole
-- table, with no organization_id. A GTIN is a GLOBAL trade-item number: two
-- resellers who both list the same Bose headset legitimately hold the SAME
-- digits. Under the old index the second tenant to enter it gets a unique
-- violation on a value that is correct — one org silently claiming a number
-- that belongs to the product, not to them.
--
-- Same class as the `sku_catalog_sku_key` global-unique already superseded by
-- `sku_catalog_org_sku_key` (2026-06-28j), and as the `sku_platform_ids`
-- tenant-blind unique that broke the Sheets import.
--
-- WHY NOBODY HIT IT UNTIL NOW.
-- Nothing in the product ever wrote this column except
-- `getOrCreateInternalGtin`, which mints `'02' + sku_catalog.id + check digit`
-- — derived from a GLOBALLY unique serial, so two orgs could never collide by
-- construction. The collision only becomes reachable the moment a human can
-- type a real GTIN, which is what the PATCH path added alongside this file.
--
-- ORDER IS DELIBERATE: the per-org index is created BEFORE the global one is
-- dropped, so uniqueness is never unenforced, not even inside this
-- transaction. The new index is strictly weaker, so it cannot fail to build on
-- data the old one already accepted.
--
-- NOT `CONCURRENTLY`: this runner wraps migrations in a transaction, and
-- CREATE INDEX CONCURRENTLY cannot run in one. sku_catalog is small (thousands
-- of rows per org), so the brief write lock is not worth splitting the file.
--
-- Predicate keeps the empty-string exclusion from the original: '' is how some
-- legacy sync paths spelled "no GTIN", and it must not count as a value.
--
-- ROLLBACK:
--   CREATE UNIQUE INDEX IF NOT EXISTS idx_sku_catalog_gtin
--     ON sku_catalog(gtin) WHERE gtin IS NOT NULL AND gtin <> '';
--   DROP INDEX IF EXISTS idx_sku_catalog_org_gtin;
--   -- (the rollback fails if two orgs already share a GTIN, which is the point)
--
-- VERIFY:
--   \d sku_catalog                      -- idx_sku_catalog_org_gtin present,
--                                       -- idx_sku_catalog_gtin gone
--   SELECT gtin, COUNT(DISTINCT organization_id)
--     FROM sku_catalog WHERE gtin IS NOT NULL AND gtin <> ''
--    GROUP BY gtin HAVING COUNT(DISTINCT organization_id) > 1;   -- now legal
-- ============================================================================

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sku_catalog_org_gtin
  ON sku_catalog (organization_id, gtin)
  WHERE gtin IS NOT NULL AND gtin <> '';

DROP INDEX IF EXISTS idx_sku_catalog_gtin;

COMMENT ON COLUMN sku_catalog.gtin IS
  'GS1 Global Trade Item Number — used to encode Digital Link QRs (/01/{gtin}). Unique PER ORG (idx_sku_catalog_org_gtin): the same real GTIN legitimately appears in two tenants. May hold an internally-minted restricted-circulation number (02…) from getOrCreateInternalGtin — isRestrictedCirculationGtin() tells the two apart.';

COMMIT;
