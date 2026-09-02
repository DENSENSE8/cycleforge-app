-- 2026-09-02b: insight_links — add canonical tenant_isolation policy
--
-- insight_links is FORCEd with hand-written NULL-aware policies
-- (insight_links_tenant_read / _write) so global benchmark rows
-- (organization_id IS NULL) remain readable. The structural tenancy
-- guard (cross-org-isolation.test.ts) requires a policy named exactly
-- `tenant_isolation` with both USING and WITH CHECK on every FORCEd
-- table. Add that name without dropping the NULL-aware read policy.
--
-- Permissive policies OR together — SELECT still sees global rows via
-- insight_links_tenant_read; writes still require the current org.

BEGIN;

DROP POLICY IF EXISTS tenant_isolation ON insight_links;
CREATE POLICY tenant_isolation ON insight_links
  FOR ALL
  USING (
    organization_id IS NULL
    OR organization_id = NULLIF(current_setting('app.current_org', true), '')::uuid
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_org', true), '')::uuid
  );

COMMIT;
