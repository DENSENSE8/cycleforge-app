-- 2026-09-28w_sal_pick_scan_order_row_id_backfill.sql
--
-- WHAT
--   Stamp metadata.order_row_id (and so the generated column
--   station_activity_logs.order_row_id) on PICK / PICK_SCANNED rows that carry
--   a shipment_id but no order_row_id, when that shipment belongs to exactly
--   ONE order of the same organization. Each stamped row also gets
--   metadata.order_row_id_backfill = '2026-09-28w' (the rollback key).
--
-- WHY
--   The feed's pick facts (PICK_FACTS_LATERALS `pick_scan` in
--   src/lib/neon/orders-queries.ts, sqlOrderPickedByStaffId in
--   src/lib/orders/desk-view-sql.ts) read a pick scan as the order's when
--   `order_row_id = o.id`, else — for legacy unattributed rows — when the scan's
--   shipment has no sibling order (the sole-shipment rule of order-grain-sql.ts).
--   This migration writes that attribution onto the rows once, so the shipment
--   fallback arm can be deleted and every pick-scan read is a plain
--   order_row_id index probe. The desk scan route already writes order_row_id
--   for every order-found scan; only history lacks it.
--
-- SCOPE (dev, 2026-09-28, before apply)
--   3,138 PICK/PICK_SCANNED rows with shipment_id and no order_row_id:
--   2,067 on a sole-order shipment (stamped), 1,068 on a shipment with no order
--   (left alone — the fallback never matched them), 3 on a two-order shipment
--   (left alone — the fallback never matched them either).
--
-- SAFETY
--   The attribution equals what the fallback arm computes today, so the feed's
--   picked_by / picked_at / has_pick_scan are unchanged for every order (verified
--   by diffing /api/orders before/after). metadata.order_id (ext_order_id) is NOT
--   written: sibling lines share a marketplace order id and would match it.
--   Idempotent: the WHERE only matches rows still missing order_row_id.
--   No triggers on station_activity_logs.
--
-- VERIFY
--   SELECT count(*) FROM station_activity_logs
--    WHERE metadata->>'order_row_id_backfill' = '2026-09-28w';      -- dev: 2,067
--   SELECT count(*) FROM station_activity_logs sal
--    WHERE sal.station = 'PICK' AND sal.activity_type = 'PICK_SCANNED'
--      AND sal.shipment_id IS NOT NULL AND sal.metadata->>'order_row_id' IS NULL
--      AND (SELECT count(*) FROM orders o WHERE o.shipment_id = sal.shipment_id
--             AND o.organization_id = sal.organization_id) = 1;     -- expect 0
--
-- ROLLBACK
--   UPDATE station_activity_logs
--      SET metadata = metadata - 'order_row_id' - 'order_row_id_backfill'
--    WHERE metadata->>'order_row_id_backfill' = '2026-09-28w';
--   (and restore the shipment fallback arm in the two readers above)

UPDATE station_activity_logs sal
   SET metadata = COALESCE(sal.metadata, '{}'::jsonb)
                  || jsonb_build_object('order_row_id', o.id, 'order_row_id_backfill', '2026-09-28w')
  FROM orders o
 WHERE sal.station = 'PICK'
   AND sal.activity_type = 'PICK_SCANNED'
   AND sal.shipment_id IS NOT NULL
   AND (sal.metadata->>'order_row_id') IS NULL
   AND o.shipment_id = sal.shipment_id
   AND o.organization_id = sal.organization_id
   AND NOT EXISTS (
     SELECT 1 FROM orders o2
      WHERE o2.shipment_id = sal.shipment_id
        AND o2.organization_id = sal.organization_id
        AND o2.id <> o.id
   );
