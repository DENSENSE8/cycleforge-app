-- Project membership — which staffers belong on an ops plan (Home → Tasks).
--
-- Why: Home Tasks assigns people to exact projects. Task assignee is one
-- person on a row; membership is the project's roster. Tenant-from-birth:
-- every writer stamps organization_id under withTenantTransaction / tenantQuery.
--
-- Safety: idempotent DDL; enforce_tenant_isolation() when the helper exists
-- (2026-06-14_rls_enforcement_infra.sql).
-- Rollback (dev): SELECT relax_tenant_isolation('ops_plan_members');
--   DROP TABLE IF EXISTS ops_plan_members;
-- Verify: \d ops_plan_members — org PK, plan + staff FKs, FORCE RLS.

BEGIN;

CREATE TABLE IF NOT EXISTS ops_plan_members (
  organization_id    UUID NOT NULL,
  plan_id            UUID NOT NULL REFERENCES ops_plans(id) ON DELETE CASCADE,
  staff_id           INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  added_by_staff_id  INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, plan_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_ops_plan_members_org_staff
  ON ops_plan_members (organization_id, staff_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('ops_plan_members');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — ops_plan_members left without FORCE RLS';
  END IF;
END $$;

COMMIT;
