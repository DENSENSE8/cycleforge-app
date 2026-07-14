-- ============================================================================
-- 2026-07-14: orders.is_urgent — operator-toggled "urgent / expedited" flag.
-- ============================================================================
-- A per-order-line boolean the operator flips from the dashboard queue row's
-- quick-actions (Zap toggle). Powers the urgent row marker and (later) an
-- "Expedited" queue filter (tier-0 semantics; mirrors receiving.priority_tier
-- convention without a second numbering scheme for a simple on/off toggle).
--
-- orders is already tenant-scoped + RLS-armed (2026-05-23_org_id_on_business_
-- tables.sql); this only adds a defaulted column, so no enforce_tenant_isolation
-- call is needed. NOT NULL DEFAULT false backfills existing rows to "not urgent".
-- ----------------------------------------------------------------------------

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN NOT NULL DEFAULT false;

-- Partial index: the urgent set is a small minority; a partial index keeps the
-- future "Expedited" filter scan cheap and per-org.
CREATE INDEX IF NOT EXISTS idx_orders_org_is_urgent
  ON orders (organization_id)
  WHERE is_urgent;
