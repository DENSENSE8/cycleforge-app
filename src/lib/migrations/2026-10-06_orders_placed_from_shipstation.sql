-- 2026-10-06_orders_placed_from_shipstation.sql
-- Placed (`orders.order_date`, the channel's order date) from the ShipStation
-- order each row is linked to (Phase 1 slice 3).
--
-- What:
--   1. Fill: a row with no Placed takes its linked ShipStation order's date.
--      Root: the ingest backfill planner never carried orderDate, so a row
--      first imported elsewhere (sheet, CSV) never got the date ShipStation
--      later delivered (planOrderRowBackfill now fills a blank Placed).
--   2. Correct: ShipStation v1 sends Pacific wall time with no offset; the
--      connector read it with `new Date()` in the HOST zone, so rows synced on a
--      UTC host carry Placed 7–8 h early. A row whose Placed equals the ref's
--      text read as UTC (and that differs from the Pacific reading) is rewritten
--      to the Pacific instant (shipStationV1Instant now parses it that way).
--   Measured on dev before apply (org …01): 135 fills, 240 corrections, 377
--   already correct, 3 rows whose Placed came from another source (kept).
--
-- Safety gating: data-only; idempotent (a corrected row equals the Pacific
-- reading and no longer matches either predicate).
-- ROLLBACK: none — both writes move a row onto the instant ShipStation states.

WITH ref AS (
  SELECT DISTINCT ON (r.organization_id, r.order_row_id)
         r.organization_id, r.order_row_id,
         (NULLIF(btrim(r.order_date), '')::timestamp AT TIME ZONE 'America/Los_Angeles') AS pacific,
         (NULLIF(btrim(r.order_date), '')::timestamp AT TIME ZONE 'UTC') AS as_utc
    FROM shipstation_order_refs r
   WHERE NULLIF(btrim(r.order_date), '') IS NOT NULL
   ORDER BY r.organization_id, r.order_row_id, r.last_seen_at DESC
)
UPDATE orders o
   SET order_date = ref.pacific
  FROM ref
 WHERE o.id = ref.order_row_id
   AND o.organization_id = ref.organization_id
   AND (o.order_date IS NULL OR (o.order_date = ref.as_utc AND ref.as_utc <> ref.pacific));
