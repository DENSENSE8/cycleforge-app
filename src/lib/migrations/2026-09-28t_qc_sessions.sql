-- 2026-09-28t_qc_sessions.sql
-- qc_sessions — one bench-session table for all QC bench time: a unit TEST
-- session, a unit REPAIR session, and the repair-service ticket timer
-- (REPAIR_SERVICE, /m/rs/{id}/work). Generalizes repair_bench_sessions in place
-- (RENAME + widen) instead of adding a sibling table:
--   * repair_bench_sessions already IS a bench session (server-stamped start/end,
--     derived duration, one open session per tech) — a second table would fork
--     that convention;
--   * repair_actions.session_id's FK follows the rename (FKs bind by OID), so bench
--     log entries keep pointing at their session with no data move;
--   * it had 0 rows on dev when this was written, so the rename is metadata-only.
--
-- Shape after this file:
--   kind              'TEST' | 'REPAIR' | 'REPAIR_SERVICE' (existing rows → REPAIR_SERVICE)
--   serial_unit_id    the unit on the bench (TEST / REPAIR; required for those kinds)
--   repair_service_id the repair ticket (was repair_id; required for REPAIR_SERVICE)
--   location_id       the bench (a DESK location)
--   hub_device_id     the diagnostic hub attached to the session, if any
--   outcome           session summary, valid per kind; only once ended. NOT a unit
--                     verdict — verdicts are recordTestVerdict → testing_results only.
--   notes             free text captured at End
-- One open session per (org, unit, tech): uq_qc_sessions_unit_open (partial).
-- One open timer per (org, repair ticket, tech): uq_qc_sessions_repair_open (the
-- renamed uq_repair_bench_sessions_open).
--
-- SAFETY: tenant-enforced already (the table was enforce_tenant_isolation'd at
-- birth; policies are named tenant_isolation / hermes_agent_read, so they move with
-- the rename). Re-applied below idempotently. Writers stamp organization_id from the
-- auth context inside withTenantTransaction: src/lib/repair/bench-session-queries.ts
-- (/api/repair/bench-sessions, now kind='REPAIR_SERVICE') and src/lib/qc/sessions.ts
-- (/api/qc/sessions). Both ship in the same change as this file — code that still
-- says repair_bench_sessions breaks, which is intended (no compat view).
--
-- ROLLBACK (drop 2026-09-28v first — diagnostic_readings.qc_session_id FKs here):
--   DELETE FROM qc_sessions WHERE kind <> 'REPAIR_SERVICE';
--   DROP INDEX IF EXISTS uq_qc_sessions_unit_open, idx_qc_sessions_org_unit;
--   ALTER TABLE qc_sessions DROP CONSTRAINT IF EXISTS qc_sessions_kind_check,
--     DROP CONSTRAINT IF EXISTS qc_sessions_subject_check,
--     DROP CONSTRAINT IF EXISTS qc_sessions_outcome_check;
--   ALTER TABLE qc_sessions DROP COLUMN kind, DROP COLUMN serial_unit_id,
--     DROP COLUMN location_id, DROP COLUMN hub_device_id, DROP COLUMN outcome, DROP COLUMN notes;
--   ALTER TABLE qc_sessions RENAME COLUMN repair_service_id TO repair_id;
--   ALTER TABLE qc_sessions ALTER COLUMN repair_id SET NOT NULL;
--   ALTER INDEX uq_qc_sessions_repair_open RENAME TO uq_repair_bench_sessions_open;
--   ALTER INDEX idx_qc_sessions_org_repair RENAME TO idx_repair_bench_sessions_org_repair;
--   ALTER TABLE qc_sessions RENAME TO repair_bench_sessions;
--
-- VERIFY:
--   \d qc_sessions
--   select relrowsecurity, relforcerowsecurity from pg_class where relname = 'qc_sessions';
--   select confrelid::regclass from pg_constraint where conname = 'repair_actions_session_id_fkey';  -- qc_sessions

DO $$
BEGIN
  IF to_regclass('public.qc_sessions') IS NULL AND to_regclass('public.repair_bench_sessions') IS NOT NULL THEN
    ALTER TABLE repair_bench_sessions RENAME TO qc_sessions;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'qc_sessions' AND column_name = 'repair_id') THEN
    ALTER TABLE qc_sessions RENAME COLUMN repair_id TO repair_service_id;
  END IF;
  IF to_regclass('public.repair_bench_sessions_id_seq') IS NOT NULL THEN
    ALTER SEQUENCE repair_bench_sessions_id_seq RENAME TO qc_sessions_id_seq;
  END IF;
  IF to_regclass('public.repair_bench_sessions_pkey') IS NOT NULL THEN
    ALTER INDEX repair_bench_sessions_pkey RENAME TO qc_sessions_pkey;
  END IF;
  IF to_regclass('public.uq_repair_bench_sessions_open') IS NOT NULL THEN
    ALTER INDEX uq_repair_bench_sessions_open RENAME TO uq_qc_sessions_repair_open;
  END IF;
  IF to_regclass('public.idx_repair_bench_sessions_org_repair') IS NOT NULL THEN
    ALTER INDEX idx_repair_bench_sessions_org_repair RENAME TO idx_qc_sessions_org_repair;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'repair_bench_sessions_end_after_start') THEN
    ALTER TABLE qc_sessions RENAME CONSTRAINT repair_bench_sessions_end_after_start TO qc_sessions_end_after_start;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'repair_bench_sessions_repair_id_fkey') THEN
    ALTER TABLE qc_sessions RENAME CONSTRAINT repair_bench_sessions_repair_id_fkey TO qc_sessions_repair_service_id_fkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'repair_bench_sessions_staff_id_fkey') THEN
    ALTER TABLE qc_sessions RENAME CONSTRAINT repair_bench_sessions_staff_id_fkey TO qc_sessions_staff_id_fkey;
  END IF;
END $$;

ALTER TABLE qc_sessions ALTER COLUMN repair_service_id DROP NOT NULL;

-- DEFAULT only to classify pre-existing rows (all repair-ticket timers); every
-- writer names its kind, so the default is dropped right after.
ALTER TABLE qc_sessions
  ADD COLUMN IF NOT EXISTS kind           TEXT NOT NULL DEFAULT 'REPAIR_SERVICE',
  ADD COLUMN IF NOT EXISTS serial_unit_id INTEGER REFERENCES serial_units(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS location_id    INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hub_device_id  TEXT,
  ADD COLUMN IF NOT EXISTS outcome        TEXT,
  ADD COLUMN IF NOT EXISTS notes          TEXT;
ALTER TABLE qc_sessions ALTER COLUMN kind DROP DEFAULT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'qc_sessions_kind_check' AND conrelid = 'qc_sessions'::regclass) THEN
    ALTER TABLE qc_sessions ADD CONSTRAINT qc_sessions_kind_check
      CHECK (kind IN ('TEST', 'REPAIR', 'REPAIR_SERVICE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'qc_sessions_subject_check' AND conrelid = 'qc_sessions'::regclass) THEN
    ALTER TABLE qc_sessions ADD CONSTRAINT qc_sessions_subject_check
      CHECK ((kind = 'REPAIR_SERVICE' AND repair_service_id IS NOT NULL)
          OR (kind <> 'REPAIR_SERVICE' AND serial_unit_id IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'qc_sessions_outcome_check' AND conrelid = 'qc_sessions'::regclass) THEN
    ALTER TABLE qc_sessions ADD CONSTRAINT qc_sessions_outcome_check
      CHECK (outcome IS NULL
          OR (ended_at IS NOT NULL AND (
               (kind = 'TEST' AND outcome IN ('PASS', 'FAIL', 'RETEST', 'ABANDONED'))
            OR (kind <> 'TEST' AND outcome IN ('REPAIRED', 'NOT_REPAIRED', 'ABANDONED')))));
  END IF;
END $$;

-- One open session per tech per unit (per org). Start is INSERT … ON CONFLICT DO
-- NOTHING against this index, so a double-tap reuses the open session.
CREATE UNIQUE INDEX IF NOT EXISTS uq_qc_sessions_unit_open
  ON qc_sessions (organization_id, serial_unit_id, staff_id)
  WHERE ended_at IS NULL AND serial_unit_id IS NOT NULL;

-- The unit's session history, newest first (GET /api/qc/sessions?unitId=).
CREATE INDEX IF NOT EXISTS idx_qc_sessions_org_unit
  ON qc_sessions (organization_id, serial_unit_id, started_at DESC)
  WHERE serial_unit_id IS NOT NULL;

COMMENT ON TABLE qc_sessions IS
  'QC bench sessions: unit TEST/REPAIR sessions and repair-ticket timers (REPAIR_SERVICE). Server-stamped start/end; duration derived. outcome summarizes the session and is not a unit verdict (testing_results is).';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('qc_sessions');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — qc_sessions left without FORCE RLS';
  END IF;
END $$;
