-- 2026-09-02_work_sessions.sql
--
-- work_sessions + work_session_intervals (IF NOT EXISTS).
-- Parents: types in src/lib/sessions/types.ts; purposes expand 2026-08-24.
-- Armed uniqueness is per staff (two benches, two people is legal).

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
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT work_sessions_kind_chk CHECK (kind IN ('scan', 'task')),
  CONSTRAINT work_sessions_scan_type_chk CHECK ((kind = 'scan') = (scan_type IS NOT NULL)),
  CONSTRAINT work_sessions_status_chk CHECK (status IN ('open', 'parked', 'ended')),
  CONSTRAINT work_sessions_armed_chk CHECK (armed = false OR (kind = 'scan' AND status = 'open')),
  CONSTRAINT work_sessions_ended_at_chk CHECK ((status = 'ended') = (ended_at IS NOT NULL)),
  CONSTRAINT work_sessions_wrap_up_source_chk
    CHECK (wrap_up_source IS NULL OR wrap_up_source IN ('staff', 'assistant'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_work_sessions_client_event
  ON work_sessions (organization_id, client_event_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_work_sessions_staff_armed_scan
  ON work_sessions (organization_id, staff_id)
  WHERE kind = 'scan' AND armed = true AND staff_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_work_sessions_org_staff_started
  ON work_sessions (organization_id, staff_id, started_at DESC);

CREATE TABLE IF NOT EXISTS work_session_intervals (
  id              BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL,
  session_id      BIGINT NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL,
  ended_at        TIMESTAMPTZ,
  staff_id        INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  CONSTRAINT work_session_intervals_kind_chk CHECK (kind IN ('active', 'parked'))
);

CREATE INDEX IF NOT EXISTS idx_work_session_intervals_org_session
  ON work_session_intervals (organization_id, session_id, started_at);

CREATE INDEX IF NOT EXISTS idx_work_session_intervals_org_window
  ON work_session_intervals (organization_id, started_at, ended_at);

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
