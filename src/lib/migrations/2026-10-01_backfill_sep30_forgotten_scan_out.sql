-- 2026-10-01 — one-time sign-out for packages packed 2026-09-30 and never scanned out after.
--
-- WHAT + WHY
--   Staff 1 forgot to sign out packages that were packed on 2026-09-30.
--   This is not a standing filter. A completed ORDERS pack whose Pacific
--   civil day is 2026-09-30, and which has no SHIP_CONFIRM at or after that
--   pack, gets one dock stamp: staff 1, at the pack instant, marked as an
--   ops backfill (`metadata.source = ops-backfill-scan-out`).
--
--   Existing scan-outs are not rewritten. A later scan by someone else,
--   including David's four same-night scans, stays the latest fact.
--
-- SAFETY GATING
--   INSERT only. The predicate requires a completed ORDERS packer_logs row
--   for the same organization_id and shipment_id, which is what
--   trg_ship_confirm_requires_completed_pack checks. Staff 1 belongs to
--   the same organization as the pack. Re-running inserts nothing.
--
-- ROLLBACK
--   DELETE FROM station_activity_logs
--    WHERE activity_type = 'SHIP_CONFIRM'
--      AND metadata->>'source' = 'ops-backfill-scan-out'
--      AND metadata->>'reason' = 'forgotten-sign-out-2026-09-30';
--
-- VERIFY
--   SELECT count(*) FROM station_activity_logs
--    WHERE activity_type = 'SHIP_CONFIRM'
--      AND metadata->>'reason' = 'forgotten-sign-out-2026-09-30';
--   -- expect: the packs that had no scan-out at or after the pack (2 on apply)
--
INSERT INTO station_activity_logs (
  organization_id,
  station,
  activity_type,
  staff_id,
  shipment_id,
  packer_log_id,
  metadata,
  created_at
)
SELECT
  pack.organization_id,
  'OUTBOUND',
  'SHIP_CONFIRM',
  1,
  pack.shipment_id,
  pack.id,
  jsonb_build_object(
    'source', 'ops-backfill-scan-out',
    'reason', 'forgotten-sign-out-2026-09-30',
    'staff_id', 1
  ),
  pack.created_at
FROM (
  SELECT DISTINCT ON (pl.organization_id, pl.shipment_id)
         pl.organization_id,
         pl.shipment_id,
         pl.id,
         pl.created_at
    FROM packer_logs pl
    JOIN staff signer
      ON signer.id = 1
     AND signer.organization_id = pl.organization_id
   WHERE pl.tracking_type = 'ORDERS'
     AND pl.completion_state = 'COMPLETED'
     AND pl.shipment_id IS NOT NULL
     AND (timezone('America/Los_Angeles', pl.created_at))::date = DATE '2026-09-30'
   ORDER BY pl.organization_id, pl.shipment_id, pl.created_at DESC, pl.id DESC
) pack
WHERE NOT EXISTS (
  SELECT 1
    FROM station_activity_logs so
   WHERE so.organization_id = pack.organization_id
     AND so.shipment_id = pack.shipment_id
     AND so.activity_type = 'SHIP_CONFIRM'
     AND so.created_at >= pack.created_at
);
