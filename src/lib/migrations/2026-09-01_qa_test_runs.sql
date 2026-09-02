-- 2026-09-01 — QA test-run ledger
--
-- Persists operator-triggered QA actions separately from auth_audit so the QA
-- console can show run history without mixing it with sign-in/security events.
-- Metadata is written through an application allow-list; this table must never
-- receive provider credentials, authorization headers, or raw payloads.

BEGIN;

CREATE TABLE IF NOT EXISTS qa_test_runs (
  id               TEXT PRIMARY KEY,
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_staff_id   INTEGER NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  action           TEXT NOT NULL CHECK (action IN ('health_check', 'fixture_reseed', 'fixture_reset', 'webhook_replay')),
  scenario         TEXT NOT NULL CHECK (char_length(scenario) BETWEEN 1 AND 120),
  status           TEXT NOT NULL DEFAULT 'requested'
                   CHECK (status IN ('requested', 'running', 'passed', 'failed')),
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE qa_test_runs DROP CONSTRAINT IF EXISTS qa_test_runs_action_check;
ALTER TABLE qa_test_runs
  ADD CONSTRAINT qa_test_runs_action_check
  CHECK (action IN ('health_check', 'fixture_reseed', 'fixture_reset', 'webhook_replay'));

CREATE INDEX IF NOT EXISTS qa_test_runs_org_created_idx
  ON qa_test_runs (organization_id, created_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('qa_test_runs');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — qa_test_runs left without FORCE RLS';
  END IF;
END $$;

COMMENT ON TABLE qa_test_runs IS
  'Redacted, tenant-scoped QA operator run ledger. Never store credentials, auth headers, or raw provider payloads.';

COMMIT;
