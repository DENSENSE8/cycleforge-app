-- 2026-10-05_first_promised_eta.sql
--
-- WHAT
--   shipping_tracking_numbers.first_estimated_delivery_at — the carrier's FIRST
--   promised delivery instant. Written once by updateShipmentSummary
--   (src/lib/shipping/repository.ts) as
--     COALESCE(first_estimated_delivery_at, <this poll's ETA>)
--   so it is never overwritten by a later promise and never cleared on
--   delivery (estimated_delivery_at is the NEWEST promise and nulls once the
--   parcel is delivered). One-time backfill: rows that already hold an ETA
--   take it as their first promise.
--
-- WHY
--   Fulfillment › Fulfilled journey (operator 2026-10-05): a package is LATE
--   when now passes the date the carrier first promised — a slipped promise
--   that the carrier keeps re-dating must still read late
--   (src/lib/nav/fulfilled/bucket.ts, facts.promisedAt).
--
-- SAFETY
--   Additive nullable column, no default: a catalog-only change, no rewrite.
--   The backfill touches only rows with an ETA and no first promise (a few
--   thousand at most on 2026-10-05; ~12.7k rows total) and is idempotent —
--   a re-run matches nothing. Tenant-owned table already under FORCE RLS; no
--   policy change. The runner connects as the owner (BYPASSRLS), so the
--   backfill reaches every org's rows.
--
-- ROLLBACK
--   ALTER TABLE shipping_tracking_numbers DROP COLUMN IF EXISTS first_estimated_delivery_at;
--
-- VERIFY
--   SELECT count(*) FROM shipping_tracking_numbers
--    WHERE estimated_delivery_at IS NOT NULL AND first_estimated_delivery_at IS NULL;  -- 0

ALTER TABLE shipping_tracking_numbers
  ADD COLUMN IF NOT EXISTS first_estimated_delivery_at TIMESTAMPTZ NULL;

UPDATE shipping_tracking_numbers
   SET first_estimated_delivery_at = estimated_delivery_at
 WHERE first_estimated_delivery_at IS NULL
   AND estimated_delivery_at IS NOT NULL;
