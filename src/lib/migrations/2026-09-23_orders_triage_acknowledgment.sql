-- ============================================================================
-- Outbound Triage — an order is acknowledged once, with its fulfillment route
--
-- STATUS WHEN AUTHORED: **NOT APPLIED**. Apply via /db-migrate (dry-run →
-- confirm → apply). Nothing in the app applies it.
--
-- WHAT: three nullable columns on `orders` plus one CHECK and one partial index.
--   * acknowledged_at   timestamptz — when an operator acknowledged the order on
--                       the Outbound Triage board (To-ship desk, ?ack=).
--   * acknowledged_by   integer → staff(id) ON DELETE SET NULL — who did it.
--   * fulfillment_route text, 'PICK' | 'QC' — the route chosen at acknowledgment:
--       PICK = a good unit is in stock → picker → pack;
--       QC   = no good unit → picker pulls repair parts → QC → picker → pack.
--
-- WHY: the Triage board replaces the Labels paperwork walk. Every new order is
-- identified, routed, given exactly one live shipping label and then
-- acknowledged. The acknowledgment is a fact about the order row (one per
-- order, re-ack updates the route, undo clears all three), so it lives on
-- `orders` next to the other operator stamps (tracking_added_at/by,
-- label_printed_at) rather than in a side table. Written only by
-- POST/DELETE /api/orders/[id]/acknowledge; read by the `triage` saved view of
-- GET /api/v1/outbound/work (src/lib/outbound/work-projection.ts).
--
-- SAFETY: purely additive. Nullable columns with no default → metadata-only
-- ALTERs, no table rewrite, no backfill. Every existing row is NULL and
-- therefore satisfies the CHECK, so the constraint validation cannot fail.
-- `orders` is already tenant-owned (organization_id + RLS); these columns add
-- no new tenancy surface. The FK uses ON DELETE SET NULL so removing a staff
-- row never blocks on or deletes an order. The index is partial (only
-- unacknowledged rows) and leads with organization_id, so it stays small as
-- orders are acknowledged and serves the triage view's org-scoped,
-- created_at-ordered scan.
--
-- ROLLBACK (inverse DDL; drops the acknowledgment facts):
--   DROP INDEX IF EXISTS idx_orders_triage_unacknowledged;
--   ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_fulfillment_route_chk;
--   ALTER TABLE orders DROP COLUMN IF EXISTS fulfillment_route;
--   ALTER TABLE orders DROP COLUMN IF EXISTS acknowledged_by;
--   ALTER TABLE orders DROP COLUMN IF EXISTS acknowledged_at;
--
-- VERIFY (after apply):
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_name = 'orders'
--      AND column_name IN ('acknowledged_at', 'acknowledged_by', 'fulfillment_route');
--   -- Expected: 3 rows, all is_nullable = 'YES'.
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'orders'::regclass AND conname = 'orders_fulfillment_route_chk';
--   -- Expected: CHECK (((fulfillment_route IS NULL) OR (fulfillment_route = ANY (ARRAY['PICK'::text, 'QC'::text]))))
--   SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_orders_triage_unacknowledged';
--   -- Expected: ... ON public.orders USING btree (organization_id, created_at DESC) WHERE (acknowledged_at IS NULL)
-- ============================================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS acknowledged_by integer REFERENCES staff(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment_route text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'orders'::regclass
       AND conname = 'orders_fulfillment_route_chk'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_fulfillment_route_chk
      CHECK (fulfillment_route IS NULL OR fulfillment_route IN ('PICK', 'QC'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_triage_unacknowledged
  ON orders (organization_id, created_at DESC)
  WHERE acknowledged_at IS NULL;
