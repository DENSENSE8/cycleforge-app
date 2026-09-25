-- 2026-09-25c_work_assignment_documents.sql
--
-- Markdown DOCUMENTS on a thrown task. A task's `work_assignments.notes` is
-- one markdown body; some jobs need more — the SOP for a return, the plan
-- file a project is run from, the checklist a lead hands out forty times.
-- One row per document, two kinds (`source`):
--
--   source | content                      | repo_path
--   -------+------------------------------+-----------------------------------
--   upload | the markdown text (≤ 200000) | NULL
--   repo   | NULL                         | repo-relative plan file path
--                                            (docs/**.md|mdx, master-plan.mdx,
--                                            a root *.md), read LIVE from disk
--
-- A `repo` row never stores a copy: linking a plan means the floor reads the
-- plan as it is now. The partial UNIQUE (org, task, repo_path) WHERE
-- source='repo' makes linking the same plan twice a no-op; uploads may repeat.
-- Runs after 2026-09-25b_work_assignment_links.sql (same task-evidence family).
--
-- SAFETY: new table, tenant-from-birth. The only writer
-- (src/lib/tasks/task-documents-db.ts via /api/tasks/[id]/documents) runs
-- through the GUC wrappers in @/lib/tenancy/db and stamps organization_id
-- from the auth context, so the loud-fail org default and FORCE RLS are safe
-- from day one.
--
-- ROLLBACK:
--   SELECT relax_tenant_isolation('work_assignment_documents');
--   DROP TABLE IF EXISTS work_assignment_documents;
--
-- VERIFY:
--   \d+ work_assignment_documents
--   SELECT conname FROM pg_constraint
--    WHERE conrelid = 'work_assignment_documents'::regclass;
--   npm run tenancy:coverage

BEGIN;

CREATE TABLE IF NOT EXISTS work_assignment_documents (
  id                  BIGSERIAL PRIMARY KEY,
  organization_id     UUID NOT NULL,
  assignment_id       INTEGER NOT NULL REFERENCES work_assignments(id) ON DELETE CASCADE,
  source              TEXT NOT NULL,
  title               TEXT NOT NULL,
  content             TEXT,
  repo_path           TEXT,
  created_by_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT work_assignment_documents_title_len CHECK (char_length(title) BETWEEN 1 AND 200)
);

DO $$ BEGIN
  ALTER TABLE work_assignment_documents
    ADD CONSTRAINT work_assignment_documents_source_chk
    CHECK (
      (source = 'upload' AND content IS NOT NULL AND repo_path IS NULL
        AND char_length(content) <= 200000)
      OR (source = 'repo' AND repo_path IS NOT NULL AND content IS NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_work_assignment_documents_repo_path
  ON work_assignment_documents (organization_id, assignment_id, repo_path)
  WHERE source = 'repo';

CREATE INDEX IF NOT EXISTS idx_work_assignment_documents_assignment
  ON work_assignment_documents (organization_id, assignment_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('work_assignment_documents');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — work_assignment_documents left without FORCE RLS';
  END IF;
END $$;

COMMIT;
