-- ============================================================================
-- 2026-09-06_enforce_tenant_isolation_cohort_1.sql
--
-- Tenant-isolation ENFORCEMENT (FORCE RLS) for the ten tenant-owned tables
-- still carrying no isolation at all (verified live 2026-09-06). Each table:
--   • is tenant-owned with organization_id NOT NULL, and
--   • carries ZERO NULL-organization rows (so a strict =GUC policy hides
--     nothing), and
--   • has its route fan-in either GUC-wrapped (risk low), exempted, or
--     baselined per docs/tenancy/route-audit.generated.json.
--
-- Per-table evidence (live counts, 2026-09-06):
--   • ops_events               22,084 rows, 0 NULL-org, org NOT NULL with the
--     loud-fail GUC default already installed. RLS was never even ENABLEd and
--     NO policy existed — the largest fully-unprotected tenant table.
--   • organization_feature_flags  17 rows, 0 NULL-org across 7 orgs — per-org
--     keyed, NOT global-by-design (no NULL-org global flag rows exist, so the
--     insight_links NULL-aware read pattern does not apply). org NOT NULL, no
--     default; every reader/writer (src/lib/feature-flags.ts) stamps
--     organization_id explicitly, so the helper's loud-fail GUC default breaks
--     nothing.
--   • packer_log_enrichment     6,364 rows, 0 NULL-org. ENABLEd-not-FORCEd
--     with a LEGACY `packer_log_enrichment_tenant_isolation` policy
--     (USING only, no WITH CHECK, wrong name for the canary).
--   • receiving_line_facts        236 rows, 0 NULL-org — same legacy state.
--   • receiving_line_putaway        0 rows, 0 NULL-org — same legacy state.
--   • receiving_line_return        59 rows, 0 NULL-org — same legacy state.
--   • receiving_line_testing     2,984 rows, 0 NULL-org — same legacy state.
--   • receiving_line_zoho        2,082 rows, 0 NULL-org — same legacy state.
--   • receiving_triage           3,226 rows, 0 NULL-org — same legacy state.
--   • receiving_unbox            2,846 rows, 0 NULL-org — same legacy state.
--
-- All ten are strict per-tenant tables (no legitimate NULL-org/global rows),
-- so each gets the CANONICAL policy — not the insight_links NULL-aware
-- variant: DROP POLICY IF EXISTS tenant_isolation (and the legacy
-- <table>_tenant_isolation name), CREATE POLICY tenant_isolation with BOTH
-- USING and WITH CHECK on
--   organization_id = NULLIF(current_setting('app.current_org', true), '')::uuid
-- then ENABLE + FORCE ROW LEVEL SECURITY. enforce_tenant_isolation()
-- (2026-06-14_rls_enforcement_infra.sql) applies exactly that, atomically,
-- per table.
--
-- FORCE is dual-pool-safe in this deployment: the default @/lib/db pool
-- (neondb_owner, BYPASSRLS) bypasses it for admin/cron/raw-pool paths, while
-- the runtime tenant pool (app_tenant) sets app.current_org via the GUC
-- wrappers (tenantQuery/withTenantTransaction) — every tenant-pool consumer
-- of these tables already runs inside them. Each is independently revertable:
--   SELECT relax_tenant_isolation('<table>');
--
-- Per-table fault isolation: a failure on one table is caught + logged and
-- leaves that table unforced, instead of aborting the batch.
-- ============================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ops_events',
    'organization_feature_flags',
    'packer_log_enrichment',
    'receiving_line_facts',
    'receiving_line_putaway',
    'receiving_line_return',
    'receiving_line_testing',
    'receiving_line_zoho',
    'receiving_triage',
    'receiving_unbox'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'cohort_1: skip % (does not exist)', t;
      CONTINUE;
    END IF;
    BEGIN
      PERFORM enforce_tenant_isolation(t);
      RAISE NOTICE 'cohort_1: FORCEd %', t;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'cohort_1: enforce(%) failed: % — left unforced', t, SQLERRM;
    END;
  END LOOP;
END $$;
