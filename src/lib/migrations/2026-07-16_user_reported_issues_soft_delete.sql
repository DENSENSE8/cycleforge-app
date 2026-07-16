-- ============================================================================
-- 2026-07-16_user_reported_issues_soft_delete.sql — UIC-4
--
-- WHAT / WHY
--   Operators need to remove mistaken / spam reports from the Reported-Issues
--   console without destroying the audit trail. Adds `deleted_at TIMESTAMPTZ`
--   so DELETE is confirm-then-commit and NON-destructive. Reads filter
--   `deleted_at IS NULL` in src/lib/user-issues/issues.ts.
--
-- SAFETY GATING
--   Additive column on an already tenant-enforced table
--   (2026-07-11_user_reported_issues.sql → enforce_tenant_isolation). No new
--   writers; soft-delete is SET deleted_at under the same tenant GUC path.
--   Safe to apply now — FORCE RLS / org stamp unchanged.
--
-- IDEMPOTENCY
--   ADD COLUMN IF NOT EXISTS · CREATE INDEX IF NOT EXISTS · DROP/CREATE of the
--   client_event unique index (partial WHERE deleted_at IS NULL so a soft-
--   deleted report does not block a later re-report with the same clientEventId).
--
-- ROLLBACK
--   DROP INDEX IF EXISTS idx_user_reported_issues_org_live;
--   -- restore pre-UIC-4 unique (includes soft-deleted rows):
--   DROP INDEX IF EXISTS ux_user_reported_issues_org_client_event;
--   CREATE UNIQUE INDEX ux_user_reported_issues_org_client_event
--     ON user_reported_issues (organization_id, client_event_id)
--     WHERE client_event_id IS NOT NULL;
--   ALTER TABLE user_reported_issues DROP COLUMN IF EXISTS deleted_at;
--
-- VERIFY (after /db-migrate)
--   npm run tenancy:coverage
--   npm run test:user-issues
-- ============================================================================

BEGIN;

ALTER TABLE user_reported_issues
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN user_reported_issues.deleted_at IS
  'Soft-delete tombstone (UIC-4). Reads filter deleted_at IS NULL; DELETE sets now().';

-- Live-list keyset (org + created_at DESC) stays cheap as tombstones accumulate.
CREATE INDEX IF NOT EXISTS idx_user_reported_issues_org_live
  ON user_reported_issues (organization_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

-- Recreate client_event uniqueness over live rows only.
DROP INDEX IF EXISTS ux_user_reported_issues_org_client_event;
CREATE UNIQUE INDEX IF NOT EXISTS ux_user_reported_issues_org_client_event
  ON user_reported_issues (organization_id, client_event_id)
  WHERE client_event_id IS NOT NULL AND deleted_at IS NULL;

COMMIT;
