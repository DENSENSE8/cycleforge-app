-- ============================================================================
-- 2026-07-30_tech_serial_numbers_order_id.sql
--
-- CF-03 (Kinetic Ledger station-safety Phase 3): stamp an explicit order bind
-- on tech_serial_numbers so serial↔order attribution is a recorded fact, not
-- a read-time join on shared shipment_id (sibling smear).
--
-- Why safe now: every TSN writer either runs under withTenantTransaction /
-- attachTechSerial (org stamped) or already sets organization_id. The new
-- column is NULLABLE — legacy rows keep working via dual-read fallback until
-- backfilled / aged out. Writers that know the order (SAL metadata / resolved
-- scan) start stamping immediately.
--
-- Rollback: ALTER TABLE tech_serial_numbers DROP COLUMN IF EXISTS order_id;
-- Verify:   \d tech_serial_numbers  — order_id int REFERENCES orders(id)
-- ============================================================================

ALTER TABLE tech_serial_numbers
  ADD COLUMN IF NOT EXISTS order_id integer
    REFERENCES orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tech_serial_numbers_order_id
  ON tech_serial_numbers (order_id)
  WHERE order_id IS NOT NULL;

-- Org-scoped lookup for "serials on this order" (tenant + order).
CREATE INDEX IF NOT EXISTS idx_tech_serial_numbers_org_order_id
  ON tech_serial_numbers (organization_id, order_id)
  WHERE order_id IS NOT NULL;

COMMENT ON COLUMN tech_serial_numbers.order_id IS
  'CF-03: order this serial was attached to at Testing (orders.id). Prefer over shipment_id joins for attribution.';
