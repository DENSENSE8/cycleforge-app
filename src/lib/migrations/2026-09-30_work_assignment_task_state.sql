-- 2026-09-30 — work_assignments.task_state: the Tasks board's hold states.
--
-- WHAT + WHY
--   Owner 2026-09-30: "Status needs an upgrade, like follow-up, pending, and
--   more … acknowledge different statuses." A thrown task (work_type
--   'FOLLOW_UP') now reads To do · In progress · Pending · Follow-up · Blocked
--   · Done · Canceled (`src/design-system/tokens/task-status.ts`).
--
--   `assignment_status_enum` is NOT task-only: TEST / PACK / REPAIR / PICK
--   station rows, the work-orders route, the order-pick backfill and
--   fn_cancel_work_assignments_on_entity_delete all read or write it, and the
--   open-lane predicates (`status IN ('OPEN','ASSIGNED','IN_PROGRESS')`,
--   ux_work_assignments_active_entity) would silently drop a row whose status
--   became a new label. So the lifecycle stays where it is and the three new
--   states are a nullable QUALIFIER on an open row:
--
--     task_state  NULL | 'PENDING' | 'FOLLOW_UP' | 'BLOCKED'
--       PENDING    waiting on the customer or a supplier
--       FOLLOW_UP  we owe the next move (a call, an email, a chase)
--       BLOCKED    cannot move (awaiting parts, a decision, a payment)
--
--   A held task is still OPEN work to every existing reader (lanes, counts,
--   repair sync, the phone's list), which is exactly right: it is not done.
--
-- INVARIANT (enforced here, not trusted to writers)
--   A hold only exists on open work. The BEFORE trigger clears task_state
--   whenever status is (or becomes) DONE / CANCELED, so every writer that
--   closes a row — PATCH /api/tasks/[id], repair sync, work-orders, the
--   entity-delete cancel trigger — keeps the pair consistent without knowing
--   the column exists.
--
-- SAFETY GATING
--   Additive: one nullable column (no default, no rewrite), one CHECK added
--   NOT VALID then validated (every existing row is NULL), one trigger. The
--   app reads the column via `to_jsonb(wa) ->> 'task_state'` so it runs on
--   either side of this migration; a hold WRITE before it lands is refused
--   with a 409 naming this file. No tenant scoping change: the column lives
--   on the already-enforced work_assignments table.
--
-- ROLLBACK
--   DROP TRIGGER IF EXISTS trg_work_assignment_task_state_open_only ON work_assignments;
--   DROP FUNCTION IF EXISTS fn_work_assignment_task_state_open_only();
--   ALTER TABLE work_assignments DROP CONSTRAINT IF EXISTS work_assignments_task_state_check;
--   ALTER TABLE work_assignments DROP COLUMN IF EXISTS task_state;
--
-- VERIFY
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--    WHERE table_name = 'work_assignments' AND column_name = 'task_state';
--   -- expect: task_state | text | YES
--   SELECT count(*) FROM work_assignments WHERE task_state IS NOT NULL
--      AND status NOT IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS');
--   -- expect: 0

ALTER TABLE work_assignments ADD COLUMN IF NOT EXISTS task_state TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'work_assignments_task_state_check'
       AND conrelid = 'work_assignments'::regclass
  ) THEN
    ALTER TABLE work_assignments
      ADD CONSTRAINT work_assignments_task_state_check
      CHECK (task_state IS NULL OR task_state IN ('PENDING', 'FOLLOW_UP', 'BLOCKED'))
      NOT VALID;
  END IF;
END $$;

ALTER TABLE work_assignments VALIDATE CONSTRAINT work_assignments_task_state_check;

CREATE OR REPLACE FUNCTION fn_work_assignment_task_state_open_only()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.task_state IS NOT NULL
     AND NEW.status NOT IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS') THEN
    NEW.task_state := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_work_assignment_task_state_open_only ON work_assignments;
CREATE TRIGGER trg_work_assignment_task_state_open_only
  BEFORE INSERT OR UPDATE OF status, task_state ON work_assignments
  FOR EACH ROW
  EXECUTE FUNCTION fn_work_assignment_task_state_open_only();
