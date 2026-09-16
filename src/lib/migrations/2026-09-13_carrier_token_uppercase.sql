-- ============================================================================
-- 2026-09-13: shipping_tracking_numbers.carrier is an UPPERCASE token
-- ============================================================================
-- `carrier` is the key the poll sweep filters on (`getDueShipments` →
-- ENABLED_SYNC_CARRIERS). Seven different INSERT sites supply the value
-- themselves, and one lane row reached the table as lowercase `usps`. A
-- case-sensitive filter drops such a row out of every sweep FOREVER, with no
-- poll, no status, no error row and nothing on any desk explaining why. That is
-- the worst failure shape we have: invisible and permanent.
--
-- The readers are now case-insensitive (`upper(carrier) = ANY(...)`,
-- `isCarrierSyncEnabled`), so this is belt AND braces: normalize what is
-- stored, then constrain the column so the next writer that forgets fails
-- LOUDLY at the boundary instead of quietly a month later on the floor.
--
-- Trim is included because a trailing space is the same bug wearing a different
-- hat: 'UPS ' is not 'UPS' to either a filter or a CHECK.
--
-- Idempotent: the UPDATE's predicate is the deviation itself, and the
-- constraint is dropped before it is added.
--
-- ROLLBACK:
--   ALTER TABLE shipping_tracking_numbers DROP CONSTRAINT IF EXISTS stn_carrier_upper_chk;
--   -- the casing normalization is not rolled back: lowercase was never a
--   -- distinct carrier, only an unpollable spelling of one.
--
-- VERIFY (after apply):
--   SELECT count(*) FROM shipping_tracking_numbers
--    WHERE carrier IS NOT NULL AND carrier <> upper(btrim(carrier));  -- expect 0
-- ============================================================================

BEGIN;

UPDATE shipping_tracking_numbers
   SET carrier    = upper(btrim(carrier)),
       updated_at = now()
 WHERE carrier IS NOT NULL
   AND carrier <> upper(btrim(carrier));

ALTER TABLE shipping_tracking_numbers
  DROP CONSTRAINT IF EXISTS stn_carrier_upper_chk;

ALTER TABLE shipping_tracking_numbers
  ADD CONSTRAINT stn_carrier_upper_chk
  CHECK (carrier IS NULL OR carrier = upper(btrim(carrier)));

COMMIT;
