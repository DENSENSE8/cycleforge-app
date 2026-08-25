-- 2026-08-23g_work_order_session_expand.sql
--
-- THE WORK ORDER SESSION — expand step.
--
-- Two nullable columns that make a session a titled WRAPPER and let N
-- assignments hang under it:
--
--   work_sessions.title              TEXT    -- the org's own words for the job
--   work_assignments.work_session_id BIGINT  -- which wrapper this unit sits in
--
-- Plan: docs/warehouse-os/06-work-order-migration-path.md · LAWS.md S10, S11, K12.
-- Parents: work_sessions (2026-08-22b), work_assignments (baseline, widened
-- 2026-08-08a/b and 2026-08-08d).
--
-- ── WHY A TITLE, WHEN scan_type ALREADY NAMES THE JOB ───────────────────────
--
-- Because `scan_type` is not a name, it is a VOCABULARY — a fixed list that
-- only grows by migration. "Unbox" is what one warehouse calls a bench; it is
-- not a fact about the software, and another org's goods-in desk should not
-- need a schema change to be called what its operators call it.
--
-- The cost of the current shape is measured, on this table's neighbour: the
-- three `work_assignments` enums have taken **six `ALTER TYPE` migrations** to
-- add vocabulary — SKU_STOCK, STOCK_REPLENISH, OPEN, FOLLOW_UP, SUPPORT_TICKET
-- — and each needs TWO files, because PostgreSQL refuses a new enum label used
-- in the transaction that added it (2026-08-08b's own header says so).
--
-- This repo has reached the same conclusion twice more, independently:
--   • 2026-08-23b refused a CHECK on ops_events.session_type — "a CHECK here
--     would mean a migration every time a bench is added";
--   • docs/todo/schema-wide-polymorphic-refactor-plan.md names
--     work_assignments.entity_type as the "precedent for don't do this for a
--     tenant-extensible axis".
--
-- ── title IS NOT A DISPATCHER, AND THAT SEPARATION IS THE POINT ─────────────
--
-- `work_sessions.surface_key` ALREADY exists and is already documented as "a
-- SURFACE_REGISTRY key — CODE, not a table". So the thing that decides which UI
-- renders is built; only the human name was missing. After this:
--
--     title        → what the operator calls it.  Editable. Data.
--     surface_key  → what renders and validates it. Registry key. Code.
--
-- Conflating them is what turned an operator's vocabulary into a schema
-- problem. Keeping them apart is what lets a bench be renamed at 3pm without a
-- deploy, while the code that knows how to run it stays pinned.
--
-- CONSEQUENCE FOR REPORTING, and it is load-bearing: when scan_type is
-- eventually contracted away, `ops_events.session_type` must follow
-- **surface_key**, NEVER title. A2 rules that the classification of a past
-- event may not change, and a title is editable — renaming "Unbox" to
-- "Goods-in" would silently reclassify every event ever emitted under it.
--
-- ── WHY THE FK GOES ON work_assignments AND NOT THE REVERSE ─────────────────
--
-- The cardinality is one session to N assignments (S11): a work order session
-- is the wrapper, and two people may hold different assignments inside it. The
-- FK belongs on the many side. A `work_assignments_id` on the session could
-- only ever hold one, which is the same cardinality error that kept an entity
-- link off work_sessions in the first place (D11).
--
-- ON DELETE SET NULL, not CASCADE. An assignment is a record of work owed and
-- possibly done; the session is the container it was organised in. Removing the
-- container does not un-assign the work, and it must not delete the row a
-- report already counted — the same contract ops_events.session_id (2026-08-23b)
-- and agent_mutations.ai_chat_session_id (2026-07-03o) both hold.
--
-- ── SAFETY / GATING ─────────────────────────────────────────────────────────
--
-- Pure expand (D6). Two nullable ADD COLUMNs, one guarded FK, one partial
-- index. No defaults, no backfill, no rewrite, no constraint on existing rows,
-- and NOTHING READS EITHER COLUMN YET. Every one of the 65 files touching
-- work_assignments keeps compiling and behaving identically, because a column
-- nobody selects cannot change a result.
--
-- This deliberately does NOT touch: `scan_type`, its CHECK
-- (`work_sessions_scan_type_chk`, law S7), the armed-scan partial unique index
-- (`ux_work_sessions_armed_scan`, law S1), or any of the three
-- work_assignments enums. Those are the CONTRACT step and each needs its own
-- file after the readers have moved — see the path doc.
--
-- TENANCY: both tables are already tenant-scoped with the GUC default and FORCE
-- RLS (work_sessions from birth, 2026-08-22b; work_assignments retrofitted via
-- 2026-06-22e). Adding columns does not change either policy, and the new index
-- leads with organization_id like every other index on these tables.
--
-- The FK is on `id` alone rather than (organization_id, id), for the reason set
-- out in 2026-08-23a: FK checks are not RLS-subject, but the only writer runs
-- under withTenantTransaction with an explicit org predicate, so a cross-tenant
-- session id is not reachable from the code that fills the column.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--
--   DROP INDEX IF EXISTS idx_work_assignments_org_work_session;
--   ALTER TABLE work_assignments
--     DROP CONSTRAINT IF EXISTS work_assignments_work_session_fk,
--     DROP COLUMN IF EXISTS work_session_id;
--   ALTER TABLE work_sessions DROP COLUMN IF EXISTS title;
--
-- Safe at any point before a writer exists, which is the window this file is
-- designed to sit in.
--
-- ── VERIFY ──────────────────────────────────────────────────────────────────
--
--   \d+ work_sessions
--   \d+ work_assignments
--   -- both nullable, no default:
--   select table_name, column_name, is_nullable, column_default
--     from information_schema.columns
--    where (table_name, column_name) in
--          (('work_sessions','title'), ('work_assignments','work_session_id'));
--   -- the wrapper read, and it should use the partial index:
--   explain analyze
--   select id, work_type, assignee_staff_id, status from work_assignments
--    where organization_id = :org and work_session_id = :session;

BEGIN;

-- The org's own words for this job. NULL = not yet titled, which is honest for
-- every row written before this and is what the backfill in the CODE step
-- resolves. Never a CHECK and never an enum (K12).
ALTER TABLE work_sessions
  ADD COLUMN IF NOT EXISTS title TEXT;

-- The many side of one-session-to-N-assignments (S11).
ALTER TABLE work_assignments
  ADD COLUMN IF NOT EXISTS work_session_id BIGINT;

-- Guarded: work_sessions is created by 2026-08-22b. If an environment somehow
-- runs this first the column still lands; only the FK waits.
DO $$
BEGIN
  IF to_regclass('public.work_sessions') IS NULL THEN
    RAISE NOTICE 'work_assignments.work_session_id: work_sessions absent — FK skipped';
  ELSE
    BEGIN
      ALTER TABLE work_assignments
        ADD CONSTRAINT work_assignments_work_session_fk
        FOREIGN KEY (work_session_id) REFERENCES work_sessions(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

-- "Every unit of work inside this work order session." Partial, because until
-- the CODE step lands almost every row is NULL, and after it every row that
-- predates the wrapper still is — there is no reason to index those.
CREATE INDEX IF NOT EXISTS idx_work_assignments_org_work_session
  ON work_assignments (organization_id, work_session_id, status, assigned_at DESC)
  WHERE work_session_id IS NOT NULL;

COMMENT ON COLUMN work_sessions.title IS
  'What the operator calls this job, in the org''s own words ("Unbox", "Goods-in", "Pallet 4471"). DATA, never an enum or a CHECK (K12) — a bench must be renameable without a migration. This is NOT the dispatcher: surface_key decides what renders and validates. NULL = untitled (every pre-2026-08-23g row). Reporting must never group by this — a title is editable, and A2 forbids the classification of a past event changing; group by surface_key.';

COMMENT ON COLUMN work_assignments.work_session_id IS
  'The work order session (work_sessions.id) this unit of work sits inside. One session to N assignments (S11) — the FK is on the many side. SET NULL on delete: removing the container does not un-assign work already owed or done, same contract as ops_events.session_id. NULL = an assignment made outside a session, which is every row before 2026-08-23g and stays legal.';

COMMIT;
