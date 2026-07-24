-- ============================================================================
-- 2026-07-23b: orders.is_out_of_stock — operator-toggled out-of-stock flag.
-- ============================================================================
-- Replaces the free-text `orders.out_of_stock` column (truthy-via-trim) with a
-- real BOOLEAN, matching `orders.is_urgent` (2026-07-14). Powers:
--   • Pending / Unshipped BLOCKED lane + queue-counts combos
--   • Ops dashboard OOS KPI
--   • Order details Switch + assign / PATCH / missing-parts writes
--   • Audit history via ORDER_ASSIGNMENT_UPDATED / orders.update (isOutOfStock)
--
-- Safety: orders is already tenant-scoped + RLS-armed; this only adds a
-- defaulted column + backfill + drop of the retired text column. No
-- enforce_tenant_isolation call is needed.
--
-- work_assignments.out_of_stock stays TEXT — that is the repair "missing part"
-- note, a different job than the order fulfillment flag.
--
-- Rollback:
--   ALTER TABLE orders ADD COLUMN IF NOT EXISTS out_of_stock TEXT;
--   UPDATE orders SET out_of_stock = '1' WHERE is_out_of_stock;
--   ALTER TABLE orders DROP COLUMN IF EXISTS is_out_of_stock;
--   DROP INDEX IF EXISTS idx_orders_org_is_out_of_stock;
-- ----------------------------------------------------------------------------

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS is_out_of_stock BOOLEAN NOT NULL DEFAULT false;

-- Backfill from legacy free-text flag (any non-empty trimmed value ⇒ true).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'out_of_stock'
  ) THEN
    UPDATE orders
    SET is_out_of_stock = true
    WHERE COALESCE(BTRIM(out_of_stock), '') <> ''
      AND is_out_of_stock = false;
  END IF;
END $$;

-- Partial index: OOS set is a minority; keeps BLOCKED / OOS filters cheap per-org.
CREATE INDEX IF NOT EXISTS idx_orders_org_is_out_of_stock
  ON orders (organization_id)
  WHERE is_out_of_stock;

-- Retire the text column so the boolean is the only SoT on orders.
ALTER TABLE orders DROP COLUMN IF EXISTS out_of_stock;
