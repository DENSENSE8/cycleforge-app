-- 2026-09-01_qa_console.sql
--
-- Permanent QA Console infrastructure: organization environment (sandbox vs
-- customer), a test-run ledger with redacted traces, last connection-health
-- results, scoped failure injections, and a fixture-record catalog.
--
-- WHY NOW. Integrations were being exercised with ad-hoc "test" buttons and
-- one large provisioner script. The durable pattern is a dedicated sandbox
-- organization, server-enforced developer permissions, and a persistent
-- console — not a throwaway testing mode. This migration is the data layer
-- for that console (Phase 1).
--
-- SAFETY GATING.
--   * organizations.environment is additive (nullable → defaulted → NOT NULL).
--     Existing customer orgs become 'customer'. Only the known QA org UUID
--     is backfilled to 'sandbox'.
--   * New tables are tenant-from-birth: organization_id UUID NOT NULL, per-org
--     keys, enforce_tenant_isolation() once writers stamp org (they will, in
--     the same change set, via withTenantTransaction).
--   * No secrets columns. Traces store redacted JSON only.
--
-- ROLLBACK:
--   select relax_tenant_isolation('qa_test_run_events');
--   select relax_tenant_isolation('qa_test_runs');
--   select relax_tenant_isolation('qa_connection_health');
--   select relax_tenant_isolation('qa_failure_injections');
--   select relax_tenant_isolation('qa_fixture_records');
--   select relax_tenant_isolation('qa_webhook_replays');
--   drop table if exists qa_test_run_events;
--   drop table if exists qa_webhook_replays;
--   drop table if exists qa_fixture_records;
--   drop table if exists qa_failure_injections;
--   drop table if exists qa_connection_health;
--   drop table if exists qa_test_runs;
--   alter table organizations drop column if exists environment;
--
-- VERIFY:
--   \d+ organizations
--   \d+ qa_test_runs
--   npm run tenancy:coverage

BEGIN;

-- ── Organization environment (sandbox | customer) ───────────────────────────
-- Isolation boundary for the QA Console. Customer orgs never get the console
-- even if a role is granted developer.qa_tools.* — the resolver checks this
-- column server-side.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS environment text;

UPDATE organizations
   SET environment = 'customer'
 WHERE environment IS NULL;

UPDATE organizations
   SET environment = 'sandbox'
 WHERE id = '00000000-0000-0000-0000-000000000002'::uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_environment_chk'
  ) THEN
    ALTER TABLE organizations
      ADD CONSTRAINT organizations_environment_chk
      CHECK (environment IN ('sandbox', 'customer'));
  END IF;
END $$;

ALTER TABLE organizations
  ALTER COLUMN environment SET DEFAULT 'customer';

ALTER TABLE organizations
  ALTER COLUMN environment SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_environment
  ON organizations (environment);

-- ── Test-run ledger ─────────────────────────────────────────────────────────
-- One row per QA Console action. run_id is the durable human/correlation id
-- (qa_YYYYMMDD_xxxxxx). result is redacted JSON — never tokens or secrets.

CREATE TABLE IF NOT EXISTS qa_test_runs (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid NOT NULL,
  run_id                  text NOT NULL,
  actor_staff_id          integer,
  scenario_id             text,
  connection_provider     text,
  connection_scope        text,
  kind                    text NOT NULL,
  status                  text NOT NULL DEFAULT 'running',
  started_at              timestamptz NOT NULL DEFAULT now(),
  completed_at            timestamptz,
  provider_request_count  integer NOT NULL DEFAULT 0,
  internal_writes         integer NOT NULL DEFAULT 0,
  jobs_created            integer NOT NULL DEFAULT 0,
  correlation_id          text,
  result                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_class             text,
  CONSTRAINT qa_test_runs_kind_chk
    CHECK (kind IN (
      'health_check',
      'dry_run',
      'fixture_reset',
      'fixture_reseed',
      'failure_inject',
      'webhook_replay',
      'job_control',
      'role_preview',
      'scenario'
    )),
  CONSTRAINT qa_test_runs_status_chk
    CHECK (status IN ('running', 'passed', 'failed', 'cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_qa_test_runs_org_run
  ON qa_test_runs (organization_id, run_id);

CREATE INDEX IF NOT EXISTS idx_qa_test_runs_org_started
  ON qa_test_runs (organization_id, started_at DESC);

-- ── Redacted per-run events ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS qa_test_run_events (
  id                 bigserial PRIMARY KEY,
  organization_id    uuid NOT NULL,
  run_uuid           uuid NOT NULL REFERENCES qa_test_runs(id) ON DELETE CASCADE,
  seq                integer NOT NULL,
  at                 timestamptz NOT NULL DEFAULT now(),
  provider           text,
  operation          text,
  http_status        integer,
  duration_ms        integer,
  request_hash       text,
  idempotency_key    text,
  error_class        text,
  redacted           jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_qa_test_run_events_seq
  ON qa_test_run_events (organization_id, run_uuid, seq);

CREATE INDEX IF NOT EXISTS idx_qa_test_run_events_run
  ON qa_test_run_events (organization_id, run_uuid);

-- ── Last connection-health snapshot per provider/scope ──────────────────────

CREATE TABLE IF NOT EXISTS qa_connection_health (
  organization_id       uuid NOT NULL,
  provider              text NOT NULL,
  scope                 text NOT NULL DEFAULT '',
  connected             boolean NOT NULL DEFAULT false,
  identity              text,
  environment           text,
  scopes_found          integer,
  scopes_expected       integer,
  token_expires_at      timestamptz,
  last_http_status      integer,
  last_latency_ms       integer,
  last_ok               boolean,
  last_error_class      text,
  last_error            text,
  last_success_at       timestamptz,
  last_failure_at       timestamptz,
  last_checked_at       timestamptz,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, provider, scope)
);

-- ── Temporary, auto-expiring failure injections ─────────────────────────────
-- Scoped to one org. remaining_uses defaults to 1. expires_at is required so
-- a forgotten injection cannot linger. Never used to corrupt DB state.

CREATE TABLE IF NOT EXISTS qa_failure_injections (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL,
  provider              text NOT NULL,
  scope                 text,
  profile               text NOT NULL,
  http_status           integer,
  retry_after_seconds   integer,
  remaining_uses        integer NOT NULL DEFAULT 1,
  expires_at            timestamptz NOT NULL,
  created_by_staff_id   integer,
  created_at            timestamptz NOT NULL DEFAULT now(),
  notes                 text,
  CONSTRAINT qa_failure_injections_profile_chk
    CHECK (profile IN (
      'timeout',
      'http_400',
      'http_401',
      'http_403',
      'http_409',
      'http_429',
      'http_500',
      'malformed',
      'partial',
      'delayed',
      'duplicate_callback'
    )),
  CONSTRAINT qa_failure_injections_uses_chk
    CHECK (remaining_uses >= 0)
);

CREATE INDEX IF NOT EXISTS idx_qa_failure_injections_org_provider
  ON qa_failure_injections (organization_id, provider, expires_at);

-- ── Fixture catalog (metadata, not prefixes) ────────────────────────────────
-- Every generated test record should be listed here with test_run_id +
-- scenario_id so cleanup does not rely on QA- / TEST- prefixes.

CREATE TABLE IF NOT EXISTS qa_fixture_records (
  id                 bigserial PRIMARY KEY,
  organization_id    uuid NOT NULL,
  table_name         text NOT NULL,
  entity_id          text NOT NULL,
  test_run_id        text,
  scenario_id        text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_qa_fixture_records_entity
  ON qa_fixture_records (organization_id, table_name, entity_id);

CREATE INDEX IF NOT EXISTS idx_qa_fixture_records_run
  ON qa_fixture_records (organization_id, test_run_id);

-- ── Stored webhook payloads for application replay (Phase 2) ────────────────
-- Sanitized/redacted body only. Distinct from a provider-authentic delivery.

CREATE TABLE IF NOT EXISTS qa_webhook_replays (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL,
  provider           text NOT NULL,
  source             text NOT NULL DEFAULT 'application',
  event_type         text,
  payload_redacted   jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at        timestamptz NOT NULL DEFAULT now(),
  last_replayed_at   timestamptz,
  CONSTRAINT qa_webhook_replays_source_chk
    CHECK (source IN ('provider_sandbox', 'application'))
);

CREATE INDEX IF NOT EXISTS idx_qa_webhook_replays_org
  ON qa_webhook_replays (organization_id, received_at DESC);

-- ── Tenant isolation ────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('qa_test_runs');
    PERFORM enforce_tenant_isolation('qa_test_run_events');
    PERFORM enforce_tenant_isolation('qa_connection_health');
    PERFORM enforce_tenant_isolation('qa_failure_injections');
    PERFORM enforce_tenant_isolation('qa_fixture_records');
    PERFORM enforce_tenant_isolation('qa_webhook_replays');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — QA console tables left without FORCE RLS';
  END IF;
END $$;

COMMIT;
