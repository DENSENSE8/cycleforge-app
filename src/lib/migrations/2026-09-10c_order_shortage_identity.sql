-- ============================================================================
-- 2026-09-10c: orders shortage identity — structured OOS facts beside the hold.
-- ============================================================================
-- Keep `orders.is_out_of_stock` as the BLOCKED / Pending-membership hold.
-- These columns name WHAT is short (listing SKU or kit part) so the Item-track
-- triangle can paint a product card and replenishment can target the short SKU.
-- Notes never encode this identity.
--
-- Safety: orders is already tenant-scoped + RLS-armed; this only adds nullable
-- columns with no backfill. No enforce_tenant_isolation call is needed.
--
-- Writers (assign / missing-parts / useOrderAssignment) clear every oos_* column
-- when is_out_of_stock flips to false.
--
-- Rollback:
--   ALTER TABLE orders DROP COLUMN IF EXISTS oos_kind;
--   ALTER TABLE orders DROP COLUMN IF EXISTS oos_sku;
--   ALTER TABLE orders DROP COLUMN IF EXISTS oos_sku_catalog_id;
--   ALTER TABLE orders DROP COLUMN IF EXISTS oos_kit_part_id;
--   ALTER TABLE orders DROP COLUMN IF EXISTS oos_qty_short;
--   ALTER TABLE orders DROP COLUMN IF EXISTS oos_title;
--   DROP INDEX IF EXISTS idx_orders_org_oos_sku;
-- ----------------------------------------------------------------------------

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS oos_kind TEXT,
  ADD COLUMN IF NOT EXISTS oos_sku TEXT,
  ADD COLUMN IF NOT EXISTS oos_sku_catalog_id INTEGER,
  ADD COLUMN IF NOT EXISTS oos_kit_part_id INTEGER,
  ADD COLUMN IF NOT EXISTS oos_qty_short NUMERIC(12, 2) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS oos_title TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_oos_kind_chk'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_oos_kind_chk
      CHECK (oos_kind IS NULL OR oos_kind IN ('listing', 'kit_part'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_org_oos_sku
  ON orders (organization_id, oos_sku)
  WHERE oos_sku IS NOT NULL;
