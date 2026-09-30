-- ============================================================================
-- 2026-09-29_repair_service_intake_channel_backfill.sql
--
-- How a repair reached us becomes a closed, required fact:
--
--   repair_service.intake_channel   'shipment' (shipped in) | 'pickup' (dropped off)
--
-- WHY. The repair desk (/repair) and Sales (?mode=repairs) split tickets into
-- "Shipped in" / "Dropped off" by this column (src/lib/repair/repair-channel.ts).
-- A NULL ticket lands in neither view. Org #1 had 24 NULL rows (ids 2–25, the
-- Jan 29 – Mar 17 2026 import); writers also stamped non-channel values
-- ('manual', 'warranty_logger', 'warranty_paid_repair') that no view matches.
--
-- RULE (evidence first, per row; org-agnostic):
--   shipment  ⇐ a carrier tracking number, a web-store order id, an
--               'Incoming Shipment' status now or in status_history, a
--               warranty-claim origin (the claim is against a unit we shipped;
--               the device comes back under an RMA), or a legacy
--               'warranty_*' channel value.
--   pickup    ⇐ everything else.
-- The rule reproduces every already-labelled org #1 row exactly
-- (47/47 pickup, 18/18 shipment). All 24 NULL rows carry no shipment evidence
-- and map to 'pickup': their ticket numbers (8054–8524) are the in-store paper
-- ticket sequence that continues straight into the labelled drop-off tickets
-- (8668, 8669, 8702, 8721, #9130 … 10089), every one has a local customer + phone
-- and no source order / tracking / delivery date, and NULL has always meant
-- walk-in in code (createRepair defaulted to 'pickup'; list-kiosk-visits reads
-- NULL as 'walk_in'; read-repair-ticket: "Null on a hand-entered ticket").
--
-- Tenant: repair_service already carries organization_id + RLS; the UPDATE is
-- a data fix across all orgs, no scoping change. updated_at is left alone on
-- purpose: the backfill is a classification, not an edit, and bumping it would
-- float months-old Done tickets to the top of every recency sort.
--
-- SAFETY (code → contract). Apply AFTER the code that makes every writer stamp
-- a channel: createRepair (intakeChannel required), POST /api/repair-service
-- (channel required), upsertEcwidIncomingRepair ('shipment'), warranty
-- handoff / paid-repair inserts ('shipment'), walk-in / counter intake
-- ('pickup'). Deployed code older than that writes 'manual' / 'warranty_*',
-- which the CHECK rejects. One transaction: backfill, CHECK and NOT NULL land
-- together, so no NULL can slip in between.
--
-- ROLLBACK.
--   ALTER TABLE repair_service ALTER COLUMN intake_channel DROP NOT NULL;
--   ALTER TABLE repair_service DROP CONSTRAINT IF EXISTS repair_service_intake_channel_chk;
-- (The backfilled values are correct data; leave them.)
--
-- VERIFY.
--   SELECT intake_channel, count(*) FROM repair_service GROUP BY 1;  -- no NULL
--   \d repair_service   -- intake_channel NOT NULL + repair_service_intake_channel_chk
-- ============================================================================

UPDATE repair_service rs
   SET intake_channel = CASE
         WHEN lower(btrim(rs.intake_channel)) IN ('pickup', 'shipment')
           THEN lower(btrim(rs.intake_channel))
         WHEN NULLIF(btrim(rs.source_tracking_number), '') IS NOT NULL
           OR NULLIF(btrim(rs.source_order_id), '') IS NOT NULL
           OR rs.status = 'Incoming Shipment'
           OR COALESCE(rs.status_history, '[]'::jsonb) @> '[{"status": "Incoming Shipment"}]'::jsonb
           OR lower(btrim(rs.intake_channel)) LIKE 'warranty%'
           OR EXISTS (SELECT 1 FROM warranty_claims wc WHERE wc.repair_service_id = rs.id)
           THEN 'shipment'
         ELSE 'pickup'
       END
 WHERE rs.intake_channel IS NULL
    OR rs.intake_channel NOT IN ('pickup', 'shipment');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'repair_service_intake_channel_chk'
       AND conrelid = 'repair_service'::regclass
  ) THEN
    ALTER TABLE repair_service
      ADD CONSTRAINT repair_service_intake_channel_chk
      CHECK (intake_channel IN ('pickup', 'shipment'));
  END IF;
END $$;

ALTER TABLE repair_service ALTER COLUMN intake_channel SET NOT NULL;
