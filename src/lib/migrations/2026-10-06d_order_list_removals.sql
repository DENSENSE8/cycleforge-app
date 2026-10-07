-- ============================================================================
-- 2026-10-06d_order_list_removals.sql
--
-- WHAT: `order_list_removals` — an operator took an order off the To-ship list
--       (Allocate's queues and the Live feed's open stages) with a REASON
--       ("Buyer cancelled", "Already shipped", "Delivered", "Duplicate order",
--       …), an optional note, who and when. Restorable: `restored_at` /
--       `restored_by_staff_id` put it back. Vocabulary in
--       src/lib/orders/list-removal.ts (the reason ids are code-owned; the
--       table only checks their shape, so a new reason needs no migration).
--
-- WHY A NEW TABLE: the To-ship scope (`sqlOrderInWarehouseToShip`) ignores
--       `orders.status` except `buyer_cancelled`, and channel syncs rewrite
--       `orders.status`, so a status cannot carry a durable operator removal.
--       An order shipped outside the dock (no USPS carrier poll yet, no dock
--       scan) otherwise sits in Packed forever (operator 2026-10-06).
--
-- GRAIN: one row per removal of an order row (Allocate's grain). At most ONE
--       active (unrestored) removal per order; history is kept.
--
-- TENANT-FROM-BIRTH: `organization_id UUID NOT NULL`, no DEFAULT in the DDL;
--       enforce_tenant_isolation() installs the loud-fail GUC default, FORCE
--       RLS and the canonical policy. Safe at birth: no writers yet; the only
--       writer (src/lib/orders/list-removal-store.ts) runs in
--       withTenantTransaction and stamps organization_id explicitly.
--
-- ROLLBACK: select relax_tenant_isolation('order_list_removals');
--           DROP TABLE IF EXISTS order_list_removals;
--
-- VERIFY:
--   SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'order_list_removals';
--   \d order_list_removals   -- ux_order_list_removals_active present
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS order_list_removals (
  id                   BIGSERIAL PRIMARY KEY,
  organization_id      UUID NOT NULL,                   -- no DEFAULT; helper installs the loud-fail GUC default
  order_id             INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  reason               TEXT NOT NULL,
  note                 TEXT,
  -- `orders.status` before a buyer-cancel removal rewrote it; restore puts it back.
  prior_status         TEXT,
  removed_by_staff_id  INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  removed_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  restored_by_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  restored_at          TIMESTAMPTZ,
  CONSTRAINT order_list_removals_reason_shape CHECK (reason ~ '^[a-z][a-z0-9_]{1,39}$'),
  CONSTRAINT order_list_removals_note_shape CHECK (note IS NULL OR char_length(note) <= 500)
);

-- One ACTIVE removal per order — also the To-ship scope's NOT EXISTS probe.
CREATE UNIQUE INDEX IF NOT EXISTS ux_order_list_removals_active
  ON order_list_removals (organization_id, order_id)
  WHERE restored_at IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('order_list_removals');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — order_list_removals left without FORCE RLS';
  END IF;
END $$;

COMMIT;
