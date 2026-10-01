-- 2026-09-30_shipped_handoff_index.sql
--
-- Index the Shipped desk's canonical handoff lookup. Before this index, both
-- `latest_ship_confirm` and the SHIP_CONFIRM membership probe read the broad
-- shipment-id index, visited 1,901 heap pages, and discarded 12,684 non-handoff
-- rows on the live dogfood database (8.8 ms for the latest-handoff slice alone).
--
-- The predicate is the desk invariant: a handoff has a shipment and a positive
-- staff actor. The key order serves tenant equality plus DISTINCT ON
-- (shipment_id) / newest-event ordering. INCLUDE keeps the actor check visible
-- without expanding the ordering key.
--
-- Safe now: station_activity_logs is already tenant-owned and every SHIP_CONFIRM
-- writer stamps organization_id. This adds no table, column, constraint, or RLS
-- change. CREATE INDEX IF NOT EXISTS is idempotent.
--
-- Verify after apply:
--   EXPLAIN (ANALYZE, BUFFERS)
--   SELECT DISTINCT ON (shipment_id) shipment_id, created_at
--     FROM station_activity_logs
--    WHERE organization_id = '<org>'
--      AND activity_type = 'SHIP_CONFIRM'
--      AND staff_id > 0
--      AND shipment_id IS NOT NULL
--    ORDER BY shipment_id, created_at DESC, id DESC;
-- Expected: Index Only Scan using idx_sal_org_ship_confirm_shipment_created;
-- no broad idx_station_activity_logs_shipment_id bitmap + filter.
--
-- Rollback:
--   DROP INDEX IF EXISTS idx_sal_org_ship_confirm_shipment_created;

CREATE INDEX IF NOT EXISTS idx_sal_org_ship_confirm_shipment_created
  ON station_activity_logs (organization_id, shipment_id, created_at DESC, id DESC)
  INCLUDE (staff_id)
  WHERE activity_type = 'SHIP_CONFIRM'
    AND shipment_id IS NOT NULL
    AND staff_id > 0;
