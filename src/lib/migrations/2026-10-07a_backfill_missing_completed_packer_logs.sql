-- 2026-10-07 — the pack ledgers disagree: a box the station ledger says was
-- packed (station_activity_logs PACK_COMPLETED/PACK_SCAN) but whose
-- packer_logs row never landed (partial write, ON CONFLICT, or a flow that
-- only wrote the station ledger). trg_ship_confirm_requires_completed_pack
-- keys on packer_logs, so those boxes can never scan out — the dock refuses
-- with "SHIP_CONFIRM requires a completed ORDERS pack".
--
-- WHAT + WHY
--   One completed ORDERS packer_logs row per affected shipment, attributed to
--   the station activity's first staffer at the pack instant, scan_ref the
--   box's tracking. The station ledger already asserts the pack happened;
--   this makes packer_logs agree. Not a standing filter — INSERT only.
--
-- SAFETY GATING
--   Idempotent: the NOT EXISTS means re-running inserts nothing. Rows are
--   only added where a PACK station activity already exists for the same
--   organization and shipment — no new facts, only the missing ledger twin.
--
-- ROLLBACK
--   DELETE FROM packer_logs pl
--    WHERE pl.tracking_type = 'ORDERS'
--      AND pl.completion_state = 'COMPLETED'
--      AND NOT EXISTS (
--        SELECT 1 FROM station_activity_logs sal
--         WHERE sal.organization_id = pl.organization_id
--           AND sal.shipment_id = pl.shipment_id
--           AND sal.activity_type IN ('PACK_COMPLETED', 'PACK_SCAN')
--      );
--   (scoped to rows this backfill shaped — verify first)
--
-- VERIFY
--   WITH s AS (
--     SELECT sal.shipment_id FROM station_activity_logs sal
--      WHERE sal.activity_type IN ('PACK_COMPLETED','PACK_SCAN')
--        AND sal.shipment_id IS NOT NULL
--      GROUP BY 1
--   )
--   SELECT count(*) FROM s WHERE NOT EXISTS (
--     SELECT 1 FROM packer_logs pl
--      WHERE pl.shipment_id = s.shipment_id
--        AND pl.tracking_type = 'ORDERS'
--        AND pl.completion_state = 'COMPLETED'
--   );
--   -- expect: 0 after apply (24 on apply, dogfood 2026-10-07)
--
INSERT INTO packer_logs (
  organization_id, shipment_id, scan_ref, tracking_type,
  completion_state, packed_by, created_at
)
SELECT s.organization_id,
       s.shipment_id,
       stn.tracking_number_raw,
       'ORDERS',
       'COMPLETED',
       s.packed_by,
       s.first_pack
  FROM (
    SELECT sal.organization_id,
           sal.shipment_id,
           MIN(sal.created_at) AS first_pack,
           (array_agg(sal.staff_id ORDER BY sal.created_at, sal.id) FILTER (WHERE sal.staff_id > 0))[1] AS packed_by
      FROM station_activity_logs sal
     WHERE sal.activity_type IN ('PACK_COMPLETED', 'PACK_SCAN')
       AND sal.shipment_id IS NOT NULL
     GROUP BY sal.organization_id, sal.shipment_id
  ) s
  JOIN shipping_tracking_numbers stn
    ON stn.id = s.shipment_id AND stn.organization_id = s.organization_id
 WHERE NOT EXISTS (
    SELECT 1 FROM packer_logs pl
     WHERE pl.organization_id = s.organization_id
       AND pl.shipment_id = s.shipment_id
       AND pl.tracking_type = 'ORDERS'
       AND pl.completion_state = 'COMPLETED'
 );
