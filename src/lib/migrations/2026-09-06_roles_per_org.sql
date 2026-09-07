-- 2026-09-06: roles — per-organization scoping (closes the last cross-tenant hole)
--
-- `roles` was a GLOBAL table (no organization_id, RLS off) resolved through a
-- process-wide org-unaware cache (role-store.ts). admin.manage_roles in ANY
-- tenant could PATCH/DELETE a role every other tenant resolves permissions
-- through. This migration gives every org its own copy of the taxonomy:
--
--   1. add organization_id (nullable during backfill)
--   2. cross-join every existing role into every organization
--   3. re-point every staff_roles grant to the grantee's org's copy of the
--      same role key (staff.organization_id is NOT NULL for all rows --
--      verified 2026-09-06), asserting totality before deleting the originals
--   4. NOT NULL + FK + UNIQUE (organization_id, key) replacing UNIQUE (key)
--   5. RLS: tenant_isolation policy + FORCE, matching the platform's
--      isolation model (see 2026-09-02b_insight_links_tenant_isolation.sql;
--      the structural cross-org-isolation test requires the exact policy
--      name `tenant_isolation` with both USING and WITH CHECK)
--
-- Role ids are NOT stable across orgs by design: an id from another org is a
-- different row. Handlers scope every read/write by organization_id.
--
-- Code that must land with this migration (same commit):
--   src/lib/auth/role-store.ts           — org-keyed cache, org-scoped reads
--   src/app/api/admin/roles/**           — org conjunct on all five handlers,
--                                          interim relatedness guard deleted
--   src/lib/auth/ensure-admin-role.ts    — org-scoped seed + wire
--   key-based grant sites (staff create/invite/sso/invitations/signup)
--   scripts/seed-roles.mjs               — per-org upsert + org-aware backfill

BEGIN;

ALTER TABLE roles ADD COLUMN organization_id uuid;

-- UNIQUE (key) must go BEFORE the fan-out, not after it: the per-org copies
-- below duplicate every key once per organization, so with more than one org
-- the INSERT trips `roles_key_key` and the whole migration rolls back
-- ("duplicate key value violates unique constraint"). The replacement
-- UNIQUE (organization_id, key) is created at the end, once the column is
-- populated and NOT NULL.
ALTER TABLE roles DROP CONSTRAINT roles_key_key;

-- Per-org copies of every existing (global) role, attributes verbatim.
INSERT INTO roles
  (organization_id, key, label, color, position, permissions, is_system,
   mobile_defaults, created_at, updated_at)
SELECT o.id, r.key, r.label, r.color, r.position, r.permissions, r.is_system,
       r.mobile_defaults, r.created_at, r.updated_at
  FROM roles r
 CROSS JOIN organizations o
 WHERE r.organization_id IS NULL;

-- Re-point each grant to the grantee's org's copy of the same key.
UPDATE staff_roles sr
   SET role_id = nr.id
  FROM staff s, roles old_r, roles nr
 WHERE sr.staff_id = s.id
   AND sr.role_id = old_r.id
   AND old_r.organization_id IS NULL
   AND nr.organization_id = s.organization_id
   AND nr.key = old_r.key;

-- Totality assertion BEFORE deleting originals (staff_roles.role_id cascades,
-- so a silent miss would destroy grants — fail loudly instead).
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
      FROM staff_roles sr
      LEFT JOIN roles r ON r.id = sr.role_id
     WHERE r.id IS NULL
       OR r.organization_id <> (SELECT s.organization_id FROM staff s WHERE s.id = sr.staff_id)
  ) THEN
    RAISE EXCEPTION 'roles per-org backfill incomplete: grants remain on wrong-org or missing rows';
  END IF;
END $$;

-- The original global rows are now unreferenced.
DELETE FROM roles WHERE organization_id IS NULL;

ALTER TABLE roles ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE roles
  ADD CONSTRAINT roles_organization_fk
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX roles_org_key_key ON roles (organization_id, key);

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON roles;
CREATE POLICY tenant_isolation ON roles
  FOR ALL
  USING (
    organization_id = NULLIF(current_setting('app.current_org', true), '')::uuid
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_org', true), '')::uuid
  );

COMMIT;
