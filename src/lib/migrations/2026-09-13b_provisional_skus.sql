-- ============================================================================
-- 2026-09-13b: Provisional SKUs — the on-hold placeholder product
-- ============================================================================
-- An operator scanning a rack on /m/scan finds a box whose product is not in
-- the catalog. Today that is a dead end: the pairing search only matches the
-- Zoho catalog, so the stock cannot be recorded at all and the count is simply
-- wrong until someone gets the item created upstream.
--
-- This adds a PROVISIONAL product: created on the floor from the scanned
-- barcode plus a typed name, pairable to a location immediately, and later
-- MERGED into the real SKU when it appears — carrying its bin quantity and its
-- whole ledger history across, so nothing has to be recounted.
--
-- ─── WHY THE WAREHOUSE ROW CARRIES THE FLAGS ───────────────────────────────
--
-- `sku_stock` is the WAREHOUSE row: it carries `product_title` /
-- `display_name_override`, and it is what `getBinContents` LEFT JOINs to paint
-- a bin (location-queries.ts:1001-1011). A provisional needs one of these to
-- display correctly on every warehouse surface, which is why the marking lives
-- here.
--
-- ⚠ SUPERSEDED IN PART BY 2026-09-13c.
--
-- This migration originally claimed a provisional could live as a `sku_stock`
-- row ALONE, with no `sku_catalog` row, making channel-exclusion structural.
-- That is false, and the database says so: `bin_contents.sku` carries
-- `fk_bin_contents_sku → sku_catalog(sku)` (2026-04-09_rename_zone_to_room
-- .sql:27-30), so a SKU absent from the catalog cannot be put in a bin at all
-- — the one thing a placeholder exists to do. 2026-09-13c adds the catalog
-- row and the three explicit guards that replace the structural claim.
--
-- Consequence, unchanged: a provisional cannot be allocated or listed. It is
-- stock you know you have and cannot yet sell.
--
-- ─── THE SKU STRING ────────────────────────────────────────────────────────
-- Provisionals take a `TMP-<barcode>` sku so the text key is stable, unique
-- per org, and obviously not a real SKU in any report that renders it raw.
-- `bin_contents.sku` and `sku_stock_ledger.sku` are TEXT (not FKs), which is
-- what makes the merge a plain re-key rather than an FK rewire.
-- ============================================================================

BEGIN;

-- ─── 1. Provisional marking on the warehouse stock row ──────────────────────

ALTER TABLE sku_stock
  ADD COLUMN IF NOT EXISTS is_provisional         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS provisional_barcode    TEXT,
  ADD COLUMN IF NOT EXISTS provisional_created_by INTEGER,
  ADD COLUMN IF NOT EXISTS provisional_created_at TIMESTAMPTZ;

COMMENT ON COLUMN sku_stock.is_provisional IS
  'Floor-minted placeholder product: warehouse-visible, never channel-visible. Has no sku_catalog row.';
COMMENT ON COLUMN sku_stock.provisional_barcode IS
  'The barcode/UPC scanned when the placeholder was created. The key a later real SKU is matched on.';

-- One placeholder per physical barcode per tenant: a second scan of the same
-- box must find the existing provisional, never mint a rival one holding half
-- the count.
CREATE UNIQUE INDEX IF NOT EXISTS ux_sku_stock_provisional_barcode
  ON sku_stock (organization_id, provisional_barcode)
  WHERE is_provisional = true AND provisional_barcode IS NOT NULL;

-- The "what is still unreconciled" list, and the guard every outbound query
-- can cheaply negate.
CREATE INDEX IF NOT EXISTS idx_sku_stock_provisional_open
  ON sku_stock (organization_id, sku)
  WHERE is_provisional = true;

-- ─── 2. Merge audit ─────────────────────────────────────────────────────────
-- The merge rewrites history in place — `sku_stock_ledger.sku` stops saying
-- TMP-… and starts saying the real SKU. That is the point (one unbroken
-- history for one physical product), but it means the rename itself must be
-- recorded somewhere, or the audit trail silently claims stock was always
-- filed under a SKU that did not exist at the time.
--
-- This table is that record: what was merged into what, by whom, and how many
-- rows moved.

CREATE TABLE IF NOT EXISTS provisional_sku_merges (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        UUID NOT NULL,
  provisional_sku        TEXT NOT NULL,
  provisional_barcode    TEXT,
  provisional_title      TEXT,
  target_sku             TEXT NOT NULL,
  qty_moved              INTEGER NOT NULL DEFAULT 0,
  bin_rows_moved         INTEGER NOT NULL DEFAULT 0,
  ledger_rows_rekeyed    INTEGER NOT NULL DEFAULT 0,
  merged_by_staff_id     INTEGER,
  merged_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT provisional_sku_merges_distinct_chk
    CHECK (provisional_sku <> target_sku)
);

CREATE INDEX IF NOT EXISTS idx_provisional_sku_merges_org_target
  ON provisional_sku_merges (organization_id, target_sku, merged_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ux_provisional_sku_merges_provisional
  ON provisional_sku_merges (organization_id, provisional_sku);

-- ─── 3. Tenant isolation ────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('provisional_sku_merges');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — provisional_sku_merges left without FORCE RLS';
  END IF;
END $$;

COMMIT;
