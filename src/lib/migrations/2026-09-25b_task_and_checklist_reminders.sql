-- 2026-09-25b_task_and_checklist_reminders.sql
--
-- Reminders for the task desk and the daily checklist, read by the native
-- apps through `GET /api/v1/reminders` (src/lib/reminders/*), which schedule
-- LOCAL notifications from it.
--
--   * work_assignments.remind_at — the instant a task's assignee is nudged.
--     NULL = no explicit reminder (a task with a deadline still rings at the
--     deadline; that rule lives in the resolver, not the column).
--   * daily_check_items.due_time — civil clock time (warehouse zone) the item
--     is due on each day it is live. TIME, not TIMESTAMPTZ: a recurring item
--     is due at 09:00 every day across the PST/PDT switch.
--   * daily_check_items.remind_offset_minutes — minutes before due_time to
--     ring. Meaningless without a due_time, so the CHECK pins that pairing.
--
-- SAFETY: additive nullable columns + one partial index + guarded CHECKs on
-- existing tenant tables. Both tables are already tenant-scoped (organization_id
-- NOT NULL); no new table, no new writer. Existing rows land as NULL (no
-- reminder), which the CHECK admits. The index is small (only rows with a
-- reminder) and leads with organization_id per tenancy law.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_work_assignments_remind_at;
--   ALTER TABLE work_assignments DROP COLUMN IF EXISTS remind_at;
--   ALTER TABLE daily_check_items
--     DROP CONSTRAINT IF EXISTS daily_check_items_remind_offset_range,
--     DROP COLUMN IF EXISTS remind_offset_minutes,
--     DROP COLUMN IF EXISTS due_time;
--
-- VERIFY:
--   \d+ work_assignments        -- remind_at timestamptz, idx_work_assignments_remind_at
--   \d+ daily_check_items       -- due_time time, remind_offset_minutes integer + CHECK

BEGIN;

ALTER TABLE work_assignments
  ADD COLUMN IF NOT EXISTS remind_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_work_assignments_remind_at
  ON work_assignments (organization_id, assignee_staff_id, remind_at)
  WHERE remind_at IS NOT NULL;

COMMENT ON COLUMN work_assignments.remind_at IS
  'Instant the assignee is reminded (native local notification via /api/v1/reminders). NULL = no explicit reminder; a deadline alone still rings at deadline_at.';

ALTER TABLE daily_check_items
  ADD COLUMN IF NOT EXISTS due_time TIME,
  ADD COLUMN IF NOT EXISTS remind_offset_minutes INTEGER;

DO $$ BEGIN
  ALTER TABLE daily_check_items
    ADD CONSTRAINT daily_check_items_remind_offset_range
    CHECK (
      remind_offset_minutes IS NULL
      OR (remind_offset_minutes BETWEEN 0 AND 1440 AND due_time IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN daily_check_items.due_time IS
  'Civil clock time (warehouse zone) the item is due on each day it is live. NULL = no due time.';
COMMENT ON COLUMN daily_check_items.remind_offset_minutes IS
  'Minutes before due_time the responsible staff are reminded (0..1440). Requires due_time.';

COMMIT;
