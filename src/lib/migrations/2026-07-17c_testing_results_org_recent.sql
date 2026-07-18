-- ============================================================================
-- testing_results — org-recent composite index for Outbound Ready history
--
-- WHAT / WHY
--   GET /api/outbound/ready-queue now reads the append-only testing_results
--   spine newest-first per tenant (`WHERE organization_id = $1 ORDER BY
--   created_at DESC, id DESC LIMIT N`). Live indexes cover organization_id
--   alone and created_at alone, but not the combined org+time seek that
--   multi-tenant load needs. Without this index Postgres can fall back to
--   filtering the global recent index (or scanning) once a second tenant
--   appears or the table grows.
--
-- SAFETY GATING
--   Additive CREATE INDEX IF NOT EXISTS only. No column/constraint changes.
--   Writers already stamp organization_id (recordTestVerdict). Table already
--   has FORCE RLS via enforce_tenant_isolation from the tenancy backfill.
--
-- ROLLBACK
--   DROP INDEX IF EXISTS idx_testing_results_org_recent;
--
-- VERIFY (after /db-migrate)
--   \d testing_results  — expect idx_testing_results_org_recent
--   EXPLAIN … WHERE organization_id = … ORDER BY created_at DESC, id DESC
--     LIMIT 200 — Index Scan / Index Only Scan on the new index
-- ============================================================================

BEGIN;

CREATE INDEX IF NOT EXISTS idx_testing_results_org_recent
  ON testing_results (organization_id, created_at DESC, id DESC);

COMMIT;
