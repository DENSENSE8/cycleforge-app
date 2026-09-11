-- ============================================================================
-- 2026-09-11_identification_methods.sql
--
-- Tenant identification methods (P3). Studio authors barcode grammar JSON;
-- human publish stamps published_at. The gun path loads published rows and
-- compiles to Zod/regex locally — never an LLM.
--
-- Writers stamp organization_id and run under tenantQuery /
-- withTenantTransaction. Tenant-from-birth FORCE RLS is safe.
--
-- ROLLBACK:
--   select relax_tenant_isolation('identification_methods');
--   DROP TABLE IF EXISTS identification_methods;
--
-- VERIFY (after apply): npm run tenancy:coverage
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS identification_methods (
  id              BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL,
  job_id          TEXT NOT NULL,
  grammar_json    JSONB NOT NULL,
  published_at    TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT identification_methods_org_job_unique UNIQUE (organization_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_identification_methods_org_published
  ON identification_methods (organization_id)
  WHERE published_at IS NOT NULL AND deleted_at IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('identification_methods');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — identification_methods left without FORCE RLS';
  END IF;
END $$;

COMMIT;
