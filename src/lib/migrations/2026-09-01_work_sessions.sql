-- 2026-09-01_work_sessions.sql
--
-- Birth of `work_sessions` + `work_session_intervals` on this tree.
-- 2026-08-24_work_session_purposes.sql already seeds the L1 catalog and will
-- skip purpose columns when this table is absent; this file creates the full
-- instance + interval shape so a fresh DB (and a DB that skipped 08-24's
-- ALTER) still gets title / purpose_id / notes / wrap_up from birth.
--
-- Silent staff timekeeping: duration is a fold over ACTIVE intervals (B11),
-- never wall clock and never wrap_up text. Switching scan stations parks the
-- previous open scan session and resumes (or starts) the one for the new
-- scan_type. Two staffers on two benches at once is legal.
--
-- Armed uniqueness is PER STAFF, not per org. Warehouse OS S1 (one armed
-- scan session org-wide) is the wedge mouth; that guarantee must not block
-- a second operator's timesheet. Wedge routing is out of this slice.
--
-- SAFETY: writers stamp organization_id and run under withTenantTransaction
-- (src/lib/sessions/work-sessions.ts). FORCE RLS is therefore safe.
--
-- ROLLBACK:
--   SELECT relax_tenant_isolation('work_session_intervals');
--   SELECT relax_tenant_isolation('work_sessions');
--   DROP TABLE IF EXISTS work_session_intervals;
--   DROP TABLE IF EXISTS work_sessions;
--
-- VERIFY: \d+ work_sessions; \d+ work_session_intervals

BEGIN;

CREATE TABLE IF NOT EXISTS work_sessions (
  id                  BIGSERIAL PRIMARY KEY,
  organization_id     UUID NOT NULL,
  kind                TEXT NOT NULL,
  scan_type           TEXT,
  armed               BOOLEAN NOT NULL DEFAULT false,
  surface_key         TEXT,
  status              TEXT NOT NULL DEFAULT 'open',
  version              INTEGER NOT NULL DEFAULT 0,
  staff_id            INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  claimed_by_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  claim_expires_at    TIMESTAMPTZ,
  device_id           TEXT,
  client_event_id     UUID NOT NULL,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at            TIMESTAMPTZ,
  state               JSONB NOT NULL DEFAULT '{}'::jsonb,
  title               TEXT,
  purpose_id          BIGINT,
  notes               TEXT,
  wrap_up             TEXT,
  wrap_up_source      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Skinny tables from a hypothetical earlier create get the L1/L2 columns.
ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS purpose_id BIGINT;
ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS wrap_up TEXT;
ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS wrap_up_source TEXT;

DO $$ BEGIN
  ALTER TABLE work_sessions ADD CONSTRAINT work_sessions_kind_chk
    CHECK (kind IN ('scan', 'task'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE work_sessions ADD CONSTRAINT work_sessions_scan_type_chk
    CHECK (
      (kind = 'scan') = (scan_type IS NOT NULL)
      AND (
        scan_type IS NULL
        OR scan_type IN ('unbox', 'triage', 'pickup', 'test', 'pack', 'outbound')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE work_sessions ADD CONSTRAINT work_sessions_status_chk
    CHECK (status IN ('open', 'parked', 'ended'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE work_sessions ADD CONSTRAINT work_sessions_armed_chk
    CHECK (armed = false OR (kind = 'scan' AND status = 'open'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE work_sessions ADD CONSTRAINT work_sessions_ended_at_chk
    CHECK ((status = 'ended') = (ended_at IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE work_sessions ADD CONSTRAINT work_sessions_wrap_up_source_chk
    CHECK (wrap_up_source IS NULL OR wrap_up_source IN ('staff', 'assistant'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE work_sessions
    ADD CONSTRAINT work_sessions_purpose_fk
    FOREIGN KEY (purpose_id) REFERENCES work_session_purposes(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_work_sessions_client_event
  ON work_sessions (organization_id, client_event_id);

-- One armed scan session per staffer (silent timekeeping). Not org-wide.
CREATE UNIQUE INDEX IF NOT EXISTS ux_work_sessions_staff_armed_scan
  ON work_sessions (organization_id, staff_id)
  WHERE kind = 'scan' AND armed AND staff_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_work_sessions_org_staff_live
  ON work_sessions (organization_id, staff_id, started_at DESC)
  WHERE status IN ('open', 'parked');

CREATE INDEX IF NOT EXISTS idx_work_sessions_org_purpose
  ON work_sessions (organization_id, purpose_id, started_at DESC)
  WHERE purpose_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS work_session_intervals (
  id                BIGSERIAL PRIMARY KEY,
  organization_id   UUID NOT NULL,
  session_id        BIGINT NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
  kind              TEXT NOT NULL,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at          TIMESTAMPTZ,
  staff_id          INTEGER REFERENCES staff(id) ON DELETE SET NULL
);

DO $$ BEGIN
  ALTER TABLE work_session_intervals ADD CONSTRAINT work_session_intervals_kind_chk
    CHECK (kind IN ('active', 'parked'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_work_session_intervals_open
  ON work_session_intervals (session_id)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_work_session_intervals_org_staff_started
  ON work_session_intervals (organization_id, staff_id, started_at DESC);

COMMENT ON TABLE work_sessions IS
  'One titled work block. kind=scan carries scan_type; duration is Σ active intervals, never this row''s wall span.';

COMMENT ON TABLE work_session_intervals IS
  'Tiles a session''s wall clock: at any instant the session is in exactly one open interval (active or parked). Daily report folds kind=active.';

COMMENT ON INDEX ux_work_sessions_staff_armed_scan IS
  'At most one armed scan session per staff in an org. Not S1 org-wide wedge uniqueness.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('work_sessions');
    PERFORM enforce_tenant_isolation('work_session_intervals');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — work_sessions left without FORCE RLS';
  END IF;
END $$;

COMMIT;
