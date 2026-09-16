-- ============================================================================
-- 2026-09-11d: shipping_tracking_numbers — delivered ⇒ DELIVERED category
-- ============================================================================
-- `latest_status_category` is the field every outbound desk FILTERS and PAINTS
-- on. `updateShipmentSummary` derived is_delivered / delivered_at / is_terminal
-- from the append-only event log (A1/A2) but still wrote the category from the
-- carrier SNAPSHOT verbatim, so a package whose snapshot's newest scan was
-- "Out for delivery" while the payload carried a delivered timestamp landed:
--
--   is_delivered = true, delivered_at set, is_terminal = true,
--   latest_status_category = 'OUT_FOR_DELIVERY'
--
-- Effect on the floor: 29 delivered packages painted "Out for delivery" a month
-- after the doorstep scan, sat in the Out-for-delivery lane forever, never
-- appeared in Delivered, and — being terminal — were skipped by the 72h stall
-- rule, so nothing ever flagged them either.
--
-- The writer is fixed (repository.ts, A5: storedStatus). This repairs the rows
-- already stored. RETURNED is its own terminal outcome and keeps its word; a
-- NULL category means "the carrier never reported" and is left alone — this
-- migration invents no carrier facts, it only stops one from contradicting
-- another on the same row.
--
-- Idempotent: the predicate is the incoherence itself, so a re-run matches
-- nothing.
--
-- ROLLBACK: none. The prior value was a self-contradiction, not a fact; the
-- carrier's own words are still in latest_status_label / latest_status_description
-- and every scan is in shipment_tracking_events.
--
-- VERIFY (after apply):
--   SELECT count(*) FROM shipping_tracking_numbers
--    WHERE is_delivered
--      AND latest_status_category IS NOT NULL
--      AND latest_status_category NOT IN ('DELIVERED','RETURNED');  -- expect 0
-- ============================================================================

BEGIN;

UPDATE shipping_tracking_numbers
   SET latest_status_category = 'DELIVERED',
       updated_at             = now()
 WHERE is_delivered
   AND latest_status_category IS NOT NULL
   AND latest_status_category NOT IN ('DELIVERED', 'RETURNED');

COMMIT;
