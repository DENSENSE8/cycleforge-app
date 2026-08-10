-- ============================================================================
-- 2026-08-09c_receiving_line_putaway_staged.sql
--
-- Unbox commit step `stage` — intended putaway location before Receive.
--
-- After Print, the operator scans a bin/shelf barcode; that intent lives here
-- until Receive commits inventory and the putaway writer applies the bin.
-- Distinct from Arrival's `receiving_triage.staging_location_id` (door carton
-- shelf) and from `put_away_at` (the act that already shelved the unit).
--
-- SAFETY GATING: additive, nullable; receiving_line_putaway already carries
-- organization_id with FORCE RLS — no enforce call.
--
-- ROLLBACK:
--   ALTER TABLE receiving_line_putaway
--     DROP COLUMN IF EXISTS staged_location_id,
--     DROP COLUMN IF EXISTS staged_at,
--     DROP COLUMN IF EXISTS staged_by;
--
-- VERIFY:
--   \d+ receiving_line_putaway
-- ============================================================================

BEGIN;

ALTER TABLE receiving_line_putaway
  ADD COLUMN IF NOT EXISTS staged_location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS staged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS staged_by INTEGER REFERENCES staff(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_receiving_line_putaway_org_staged_location
  ON receiving_line_putaway (organization_id, staged_location_id)
  WHERE staged_location_id IS NOT NULL;

COMMENT ON COLUMN receiving_line_putaway.staged_location_id IS
  'Intended putaway bin scanned on Unbox commit step `stage` (after print, before receive). Distinct from receiving_triage.staging_location_id (Arrival door shelf) and from put_away_at (shelved). Never backfilled.';

COMMENT ON COLUMN receiving_line_putaway.staged_at IS
  'When the operator confirmed the intended putaway location via location barcode scan. Cleared on reopen. Gate for Unbox commit step `stage`.';

COMMIT;
