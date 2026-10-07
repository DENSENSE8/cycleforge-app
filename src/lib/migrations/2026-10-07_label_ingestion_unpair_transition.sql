-- Label unpair: let an APPLIED label go back to the waiting pool.
--
-- What + why: operator ruling 2026-10-06 (docs/refactors/live-feed/
-- HANDOFF-docs-triage-round2.md item 5) — a label applied to the wrong order
-- must be unpairable. `unpairLabelIngestion` (src/lib/label-ingestions/unpair.ts)
-- reverses what apply wrote and returns the ingestion to QUARANTINED. The
-- 2026-09-18 transition guard made APPLIED terminal, so that UPDATE raised
-- check_violation.
--
-- The amendment allows exactly ONE way out of APPLIED: APPLIED → QUARANTINED
-- with every apply fact cleared (matched_order_id, shipment_id, document_id,
-- applied_at all NULL) and row_version strictly increasing. Every other exit
-- from APPLIED still raises. The other immutability checks are unchanged.
--
-- Safety gating: function body replacement only (CREATE OR REPLACE); the
-- trigger binding is untouched. label_ingestions_applied_chk already admits the
-- cleared QUARANTINED end state. No data is rewritten.
--
-- Rollback: re-run the guard_label_ingestion_transition body from
-- 2026-09-18_v1_label_ingestions.sql (APPLIED fully terminal).
--
-- Verify: UPDATE an APPLIED test row to QUARANTINED without clearing
-- document_id → check_violation; clearing all four + row_version+1 → succeeds.

CREATE OR REPLACE FUNCTION guard_label_ingestion_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.state = 'APPLIED' AND NEW.state IS DISTINCT FROM OLD.state THEN
    IF NOT (
      NEW.state = 'QUARANTINED'
      AND NEW.matched_order_id IS NULL
      AND NEW.shipment_id IS NULL
      AND NEW.document_id IS NULL
      AND NEW.applied_at IS NULL
      AND NEW.row_version > OLD.row_version
    ) THEN
      RAISE EXCEPTION 'label_ingestions APPLIED state is terminal except an unpair to QUARANTINED'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF OLD.organization_id IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'label_ingestions organization_id is immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.sha256 IS DISTINCT FROM NEW.sha256 THEN
    RAISE EXCEPTION 'label_ingestions sha256 is immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.row_version < OLD.row_version THEN
    RAISE EXCEPTION 'label_ingestions row_version cannot decrease'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
