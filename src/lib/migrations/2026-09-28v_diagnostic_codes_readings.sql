-- 2026-09-28v_diagnostic_codes_readings.sql
-- Diagnostic code catalog + diagnostic readings for the QC bench.
--
--   diagnostic_codes     per-org catalog: what a device's error/diagnostic code means,
--                        how bad it is, and (optionally) the repair issue it usually
--                        maps to. device_family matches sku_catalog.category; NULL =
--                        the code means the same on every family. Unique per
--                        (org, family, code) — the family-specific row wins over the
--                        any-family row when a reading is resolved.
--   diagnostic_readings  append-only readings taken on a unit, from the diagnostic hub
--                        (source HUB) or keyed in by a tech (MANUAL), optionally inside
--                        a qc_sessions row. kind = what was read (ERROR_CODE,
--                        BATTERY_HEALTH, …), code = the diagnostic code when the reading
--                        is one, value = raw payload. Idempotent: every write carries a
--                        client_event_id, unique per org — a hub retry is a replay.
--
-- Ordering: 'v' after 2026-09-28t (qc_session_id → qc_sessions).
--
-- SAFETY: both tables are tenant-from-birth + enforced. Their only writers
-- (src/lib/qc/diagnostics.ts via /api/qc/codes and /api/qc/readings) run inside
-- withTenantTransaction and stamp organization_id from the auth context.
--
-- ROLLBACK:
--   select relax_tenant_isolation('diagnostic_readings');
--   select relax_tenant_isolation('diagnostic_codes');
--   DROP TABLE IF EXISTS diagnostic_readings;
--   DROP TABLE IF EXISTS diagnostic_codes;
--
-- VERIFY:
--   \d diagnostic_codes
--   \d diagnostic_readings
--   select relname, relforcerowsecurity from pg_class where relname in ('diagnostic_codes','diagnostic_readings');

CREATE TABLE IF NOT EXISTS diagnostic_codes (
  id                       BIGSERIAL PRIMARY KEY,
  organization_id          UUID NOT NULL,
  code                     TEXT NOT NULL,
  device_family            TEXT,
  meaning                  TEXT NOT NULL,
  severity                 TEXT NOT NULL,
  repair_issue_template_id INTEGER REFERENCES repair_issue_templates(id) ON DELETE SET NULL,
  active                   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT diagnostic_codes_severity_check CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
  CONSTRAINT diagnostic_codes_code_upper CHECK (code = upper(code) AND length(code) BETWEEN 1 AND 64)
);

-- One meaning per (org, family, code); '' stands for "every family" so the
-- any-family row is unique too. The upsert targets this expression index.
CREATE UNIQUE INDEX IF NOT EXISTS uq_diagnostic_codes_org_family_code
  ON diagnostic_codes (organization_id, COALESCE(device_family, ''), code);

CREATE TABLE IF NOT EXISTS diagnostic_readings (
  id                   BIGSERIAL PRIMARY KEY,
  organization_id      UUID NOT NULL,
  qc_session_id        BIGINT REFERENCES qc_sessions(id) ON DELETE SET NULL,
  serial_unit_id       INTEGER NOT NULL REFERENCES serial_units(id) ON DELETE CASCADE,
  source               TEXT NOT NULL,
  kind                 TEXT NOT NULL,
  code                 TEXT,
  value                JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hub_device_id        TEXT,
  recorded_by_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  client_event_id      TEXT NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT diagnostic_readings_source_check CHECK (source IN ('HUB', 'MANUAL'))
);

-- Idempotency key, per org.
CREATE UNIQUE INDEX IF NOT EXISTS uq_diagnostic_readings_org_client_event
  ON diagnostic_readings (organization_id, client_event_id);

-- Triage reads: a unit's readings newest first; a session's readings.
CREATE INDEX IF NOT EXISTS idx_diagnostic_readings_org_unit
  ON diagnostic_readings (organization_id, serial_unit_id, read_at DESC);
CREATE INDEX IF NOT EXISTS idx_diagnostic_readings_session
  ON diagnostic_readings (qc_session_id)
  WHERE qc_session_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('diagnostic_codes');
    PERFORM enforce_tenant_isolation('diagnostic_readings');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — diagnostic_codes/diagnostic_readings left without FORCE RLS';
  END IF;
END $$;
