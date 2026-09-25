-- 2026-09-25e_shared_task_assignees.sql
-- One FOLLOW_UP task can be handed to several staff members without copying its
-- instructions, links, status, evidence or project name. The existing
-- work_assignments.assignee_staff_id remains the first/lead assignee for old
-- readers; membership in work_assignment_assignees is authoritative for the
-- task desk, phone, inbox and reminder feed. Existing tasks are backfilled.
-- project_name is an optional human umbrella label (e.g. "Return and replacement")
-- distinct from the task's markdown instructions in notes. It is nullable for
-- historical and system-created tasks.
--
-- SAFETY: additive and idempotent. Every new member writer uses
-- withTenantTransaction and stamps organization_id from authenticated context;
-- FORCE RLS and the loud-fail tenant default are safe from birth. The backfill
-- copies only org-owned FOLLOW_UP rows, with no cross-tenant association.
--
-- ROLLBACK: SELECT relax_tenant_isolation('work_assignment_assignees');
--   DROP TABLE IF EXISTS work_assignment_assignees;
--   ALTER TABLE work_assignments DROP CONSTRAINT IF EXISTS work_assignments_project_name_len;
--   ALTER TABLE work_assignments DROP COLUMN IF EXISTS project_name;
--   Rollback removes shared membership and names; retain a backup first.
--
-- VERIFY: SELECT count(*) FROM work_assignment_assignees a JOIN work_assignments w
--   ON w.organization_id = a.organization_id AND w.id = a.assignment_id
--   WHERE w.work_type = 'FOLLOW_UP';
--   npm run tenancy:coverage

ALTER TABLE work_assignments ADD COLUMN IF NOT EXISTS project_name TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_assignments_project_name_len'
    AND conrelid = 'work_assignments'::regclass) THEN
    ALTER TABLE work_assignments ADD CONSTRAINT work_assignments_project_name_len
      CHECK (project_name IS NULL OR char_length(project_name) BETWEEN 1 AND 160);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS work_assignment_assignees (
  organization_id UUID NOT NULL,
  assignment_id INTEGER NOT NULL REFERENCES work_assignments(id) ON DELETE CASCADE,
  staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, assignment_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_work_assignment_assignees_staff
  ON work_assignment_assignees (organization_id, staff_id, assignment_id);

INSERT INTO work_assignment_assignees (organization_id, assignment_id, staff_id)
SELECT organization_id, id, assignee_staff_id
  FROM work_assignments
 WHERE work_type = 'FOLLOW_UP' AND assignee_staff_id IS NOT NULL
ON CONFLICT (organization_id, assignment_id, staff_id) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('work_assignment_assignees');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — work_assignment_assignees left without FORCE RLS';
  END IF;
END $$;
