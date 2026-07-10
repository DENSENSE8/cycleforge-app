-- cycle_forge_runs / cycle_forge_run_steps — Cycle Forge dev-loop run history.
--
-- One row per forge run (a /forge invocation from Hermes/Telegram); child rows
-- per stage (architect → build → sync → verify). Mirrors the pipeline_cycles /
-- pipeline_tasks pairing. Fed by POST /api/forge/ingest (webhook-style, shared
-- secret), read by GET /api/forge/runs, rendered on /forge.
--
-- Tenant-from-birth: enforce_tenant_isolation() installs the loud-fail GUC
-- default + FORCE RLS + canonical policy (org col carries NO default here).
-- ROLLBACK: DROP TABLE cycle_forge_run_steps, cycle_forge_runs;
-- VERIFY: npm run tenancy:coverage

BEGIN;

CREATE TABLE IF NOT EXISTS cycle_forge_runs (
  id               SERIAL PRIMARY KEY,
  organization_id  UUID NOT NULL,                 -- NO default; enforce_tenant_isolation() installs the GUC default
  run_uid          VARCHAR(64) NOT NULL,          -- forge.sh run id (timestamp/ULID); idempotency key
  feature_request  TEXT NOT NULL,
  branch           VARCHAR(200),
  manifest_path    TEXT,
  status           VARCHAR(20) NOT NULL DEFAULT 'running',
  git_diff_stat    TEXT,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE cycle_forge_runs ADD CONSTRAINT cycle_forge_runs_status_chk
    CHECK (status IN ('running','passed','failed','error','cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_cycle_forge_runs_uid
  ON cycle_forge_runs (organization_id, run_uid);
CREATE INDEX IF NOT EXISTS idx_cycle_forge_runs_recent
  ON cycle_forge_runs (organization_id, started_at DESC);

CREATE TABLE IF NOT EXISTS cycle_forge_run_steps (
  id               SERIAL PRIMARY KEY,
  organization_id  UUID NOT NULL,
  run_id           INTEGER NOT NULL REFERENCES cycle_forge_runs(id) ON DELETE CASCADE,
  stage            VARCHAR(20) NOT NULL,          -- architect|build|sync|verify (named CHECK)
  status           VARCHAR(20) NOT NULL DEFAULT 'running',
  detail           TEXT,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE cycle_forge_run_steps ADD CONSTRAINT cycle_forge_run_steps_stage_chk
    CHECK (stage IN ('architect','build','sync','verify'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE cycle_forge_run_steps ADD CONSTRAINT cycle_forge_run_steps_status_chk
    CHECK (status IN ('running','ok','failed','skipped'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One row per (run, stage): a stage update upserts on this key.
CREATE UNIQUE INDEX IF NOT EXISTS ux_cycle_forge_run_steps_stage
  ON cycle_forge_run_steps (organization_id, run_id, stage);
CREATE INDEX IF NOT EXISTS idx_cycle_forge_run_steps_by_run
  ON cycle_forge_run_steps (organization_id, run_id, created_at);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('cycle_forge_runs');
    PERFORM enforce_tenant_isolation('cycle_forge_run_steps');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — cycle_forge_* left without FORCE RLS';
  END IF;
END $$;

COMMIT;
