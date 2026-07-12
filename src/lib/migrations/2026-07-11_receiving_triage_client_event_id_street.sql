-- receiving_triage: add triage_client_event_id (Wave-3 writer-inversion prerequisite).
--
-- What / why:
--   POST /api/receiving/triage/complete's idempotency replay-detection is backed by
--   receiving.triage_client_event_id (UNIQUE partial index, 2026-07-01b) — a triage
--   fact living on the spine. The Wave-3 writer inversion moves complete-triage's
--   writes onto receiving_triage, and the Wave-4 column drop removes the spine
--   column, so the street table needs to own the idempotency key first.
--
-- Safety gating:
--   - Backfill copies the key for every carton that has one (idempotent).
--   - Uniqueness becomes ORG-LED on the street table (house rule: per-org keys;
--     the old spine index was global — keys are client-generated UUIDs, so no
--     cross-org collision is possible and the narrowing is semantically safe).
--   - The spine column + its index stay until the Wave-4 drop migration; the
--     dual-write trigger never watched this column, so no mirroring conflict.
--
-- Rollback:
--   DROP INDEX IF EXISTS ux_receiving_triage_client_event_id;
--   ALTER TABLE receiving_triage DROP COLUMN IF EXISTS triage_client_event_id;
--
-- Verify after apply:
--   SELECT COUNT(*) FROM receiving_carton r JOIN receiving_triage rt ON rt.receiving_id = r.id
--   WHERE r.triage_client_event_id IS DISTINCT FROM rt.triage_client_event_id
--     AND r.triage_client_event_id IS NOT NULL;   -- expect 0

BEGIN;

ALTER TABLE receiving_triage
  ADD COLUMN IF NOT EXISTS triage_client_event_id TEXT;

-- Idempotent backfill from the spine. Cartons whose key is set but that never met
-- the street-row predicate get a row created here (they completed triage, so the
-- predicate held anyway; belt-and-braces upsert keeps this re-runnable).
INSERT INTO receiving_triage (receiving_id, organization_id, triage_client_event_id)
SELECT r.id, r.organization_id, r.triage_client_event_id
  FROM receiving_carton r
 WHERE r.triage_client_event_id IS NOT NULL
ON CONFLICT (receiving_id) DO UPDATE
   SET triage_client_event_id = EXCLUDED.triage_client_event_id,
       updated_at = now()
 WHERE receiving_triage.triage_client_event_id IS DISTINCT FROM EXCLUDED.triage_client_event_id;

CREATE UNIQUE INDEX IF NOT EXISTS ux_receiving_triage_client_event_id
  ON receiving_triage (organization_id, triage_client_event_id)
  WHERE triage_client_event_id IS NOT NULL;

COMMIT;
