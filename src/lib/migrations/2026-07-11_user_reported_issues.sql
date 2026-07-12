-- ============================================================================
-- user_reported_issues — in-app feedback loop record (agentic loop ALP-5.1)
--
-- WHAT / WHY
--   The FeedbackWidget currently writes ONLY a GitHub Issue. This table makes
--   Neon the primary record (dual-write: DB first, GitHub best-effort) so the
--   resolution loop can close in-app: forge VERIFY/deploy marks the row
--   `deployed` + resolution_commit, publishes `issue.resolved` on the
--   reporter's org-scoped inbox channel, and the reporter gets the locked
--   sonner toast without a refresh.
--
-- STATUS VOCAB (deliberate)
--   pending | in-progress | deployed — mirrors the master-plan TicketStatus
--   enum (locked, docs/todo/agentic-loop-master-plan.md §-2) so the loop's
--   vocabulary is uniform across plan tickets and reported issues.
--
-- TENANCY / SAFETY GATING
--   Tenant-from-birth: organization_id UUID NOT NULL with NO DDL default;
--   enforce_tenant_isolation() in this same migration installs the loud-fail
--   GUC default + FORCE RLS + the canonical policy. Safe to enforce now:
--   the ONLY writer is the new /api/user-issues handler (this change), which
--   runs inside withTenantTransaction(ctx.organizationId, …). No legacy
--   writers exist (the table is new).
--
-- IDEMPOTENCY / ROLLBACK
--   Idempotent DDL (IF NOT EXISTS + guarded DO blocks). Rollback:
--     SELECT relax_tenant_isolation('user_reported_issues');
--     DROP TABLE IF EXISTS user_reported_issues;
--
-- VERIFY (after /db-migrate)
--   npm run tenancy:coverage   -- picks up org_id/RLS/FORCE state
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS user_reported_issues (
  id                  BIGSERIAL PRIMARY KEY,
  organization_id     UUID NOT NULL,               -- no default; enforce_tenant_isolation() installs it
  reporter_staff_id   INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  issue_type          TEXT NOT NULL,               -- CHECK below: bug | suggestion | question
  title               TEXT NOT NULL,
  description         TEXT NOT NULL,
  page_path           TEXT,
  github_issue_number INTEGER,
  github_issue_url    TEXT,
  status              TEXT NOT NULL DEFAULT 'pending',  -- CHECK below: pending | in-progress | deployed
  resolution_commit   TEXT,
  resolved_at         TIMESTAMPTZ,
  client_event_id     TEXT,                        -- retry idempotency (partial unique below)
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_reported_issues_title_len CHECK (char_length(title) BETWEEN 1 AND 200)
);

DO $$ BEGIN
  ALTER TABLE user_reported_issues ADD CONSTRAINT user_reported_issues_issue_type_chk
    CHECK (issue_type IN ('bug', 'suggestion', 'question'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE user_reported_issues ADD CONSTRAINT user_reported_issues_status_chk
    CHECK (status IN ('pending', 'in-progress', 'deployed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Per-org keys/indexes ALWAYS lead with organization_id.
CREATE UNIQUE INDEX IF NOT EXISTS ux_user_reported_issues_org_client_event
  ON user_reported_issues (organization_id, client_event_id)
  WHERE client_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_reported_issues_org_status
  ON user_reported_issues (organization_id, status)
  WHERE status <> 'deployed';

CREATE INDEX IF NOT EXISTS idx_user_reported_issues_org_reporter
  ON user_reported_issues (organization_id, reporter_staff_id);

-- Resolution path looks rows up by the GitHub issue number the fix PR closes.
CREATE INDEX IF NOT EXISTS idx_user_reported_issues_org_github
  ON user_reported_issues (organization_id, github_issue_number)
  WHERE github_issue_number IS NOT NULL;

COMMENT ON TABLE user_reported_issues IS
  'In-app reported issues (FeedbackWidget). Primary record of the issue→fix→toast loop; dual-written to GitHub (user-reported label). Status vocab mirrors the master-plan TicketStatus enum.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('user_reported_issues');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — user_reported_issues left without FORCE RLS';
  END IF;
END $$;

COMMIT;
