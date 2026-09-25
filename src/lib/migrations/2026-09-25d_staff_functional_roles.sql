-- 2026-09-25d_staff_functional_roles.sql
--
-- FUNCTIONAL ROLES — what a staff member DOES on the floor (picker, packer),
-- stored apart from RBAC access roles (`roles` / `staff_roles`, what a staff
-- member may ACCESS).
--
-- WHY A SEPARATE TABLE (operator 2026-09-25): the Pick / Pack assign lists
-- used to filter on RBAC keys (`technician` = Pick, `packer` = Pack) and the
-- roster switch rewrote `staff.role`. That welded "may this person open the
-- admin desk" to "does this person pick", showed only two pickers on To Ship,
-- and made picker/packer mutually exclusive. Functional roles are
-- NON-EXCLUSIVE (one person may pick and pack) and editing them never touches
-- access roles.
--
-- NO FK ON `staff_id`: mirrors sku_staff_pairings — staff rows are
-- soft-managed; an orphan row just never joins an active member.
--
-- BACKFILL: every staff member who held an RBAC `technician` / `packer` role
-- (or the legacy `staff.role` string) keeps that lane, so the lists paint the
-- same people on day one.
--
-- SAFETY GATE: the only writer (PUT /api/staff/[id]/functional-roles) runs
-- under withTenantTransaction and stamps organization_id explicitly; the
-- backfill stamps it from staff.organization_id.
--
-- ROLLBACK: select relax_tenant_isolation('staff_functional_roles');
--           DROP TABLE IF EXISTS staff_functional_roles;
--
-- VERIFY: SELECT role_key, count(*) FROM staff_functional_roles GROUP BY 1;

BEGIN;

CREATE TABLE IF NOT EXISTS staff_functional_roles (
  organization_id       UUID NOT NULL,
  staff_id              INTEGER NOT NULL,
  role_key              TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_staff_id   INTEGER,
  CONSTRAINT staff_functional_roles_pk PRIMARY KEY (organization_id, staff_id, role_key),
  CONSTRAINT staff_functional_roles_key_chk CHECK (role_key IN ('picker', 'packer'))
);

CREATE INDEX IF NOT EXISTS idx_staff_functional_roles_role
  ON staff_functional_roles (organization_id, role_key, staff_id);

COMMENT ON TABLE staff_functional_roles IS
  'Floor functional roles (picker, packer) — non-exclusive, independent of RBAC access roles.';

INSERT INTO staff_functional_roles (organization_id, staff_id, role_key)
SELECT DISTINCT s.organization_id, s.id,
       CASE WHEN lower(k.key) IN ('packer', 'pack') THEN 'packer' ELSE 'picker' END
  FROM staff s
  JOIN LATERAL (
    SELECT r.key FROM staff_roles sr JOIN roles r ON r.id = sr.role_id WHERE sr.staff_id = s.id
    UNION ALL
    SELECT s.role
  ) k ON lower(k.key) IN ('technician', 'picker', 'pick', 'tech', 'packer', 'pack')
 WHERE s.organization_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ─── Tenant isolation ───────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('staff_functional_roles');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — staff_functional_roles left without FORCE RLS';
  END IF;
END $$;

COMMIT;
