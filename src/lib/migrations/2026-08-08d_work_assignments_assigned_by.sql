-- ============================================================================
-- 2026-08-08d_work_assignments_assigned_by.sql
--
-- WHAT
--   work_assignments gains `assigned_by_staff_id` — WHO handed the work over —
--   plus a partial, org-led index for the "what did I hand off" read.
--
-- WHY
--   Every staff column on this table today is a recipient or a completer:
--   assignee_staff_id, assigned_tech_id, assigned_packer_id,
--   completed_by_tech_id, completed_by_packer_id. There is no assigner. Sibling
--   tables all have one (thread_assignments.assigned_by,
--   support_ticket_assignments.assigned_by, staff_stations.assigned_by) —
--   work_assignments is the exception, and 2026-08-08b did not close it.
--
--   The consequence is concrete: an operator can throw a task at a colleague and
--   then has NO WAY to see whether it landed or got done. On paper they at least
--   watched the person read it. Every read path here filters by recipient
--   (`getInboxFeed` is WHERE staff_id = $2; `/api/work-orders/mine` ranks by
--   assignee), so "sent" is not a query anyone can write today.
--
--   The thrower currently survives in exactly two write-only side channels, and
--   NEITHER is a usable projection:
--     • the audit row (AUDIT_ACTION.WORK_TASK_THROW) — an append-only log, not
--       a queryable worklist;
--     • staff_inbox_items.actor_staff_id — a LOSSY proxy, because the inbox row
--       is skipped entirely for entity kinds that are not inbox-anchorable
--       (support_ticket today, see create-task-core.ts → notifyQuietly). A
--       ticket task would simply vanish from a sent view built on it.
--
--   So the fact belongs on the assignment row itself.
--
-- NO BACKFILL, DELIBERATELY
--   The column stays NULL for all pre-existing rows. We do not know who created
--   them — the information was never recorded — and inventing it (e.g. copying
--   assignee, or attributing to the first auditor) would put a fabricated name
--   on a record an operator reads as fact. NULL means "not recorded", which is
--   true. Honest absence over a plausible guess.
--
-- SAFETY / GATING
--   Purely additive: one nullable column and one partial index. No existing row
--   changes, no constraint tightens, and no code reads it until the task writer
--   is updated in the same change. ON DELETE SET NULL matches every other staff
--   reference on this table — deleting a staffer must not delete the work they
--   handed out.
--
--   The index is PARTIAL (`WHERE assigned_by_staff_id IS NOT NULL`) so it costs
--   nothing for the 7844 existing rows that will never have one, and org-led per
--   polymorphic-tables.md.
--
-- ROLLBACK
--   BEGIN;
--     DROP INDEX IF EXISTS idx_work_assignments_assigned_by;
--     ALTER TABLE work_assignments DROP COLUMN IF EXISTS assigned_by_staff_id;
--   COMMIT;
--
-- VERIFY
--   \d work_assignments        -- assigned_by_staff_id integer, nullable
--   SELECT count(*) FROM work_assignments WHERE assigned_by_staff_id IS NOT NULL;
--     -- expect 0 immediately after apply; grows as tasks are thrown
--
-- Law: .claude/rules/polymorphic-tables.md · backend-patterns.md
-- ============================================================================

ALTER TABLE work_assignments
  ADD COLUMN IF NOT EXISTS assigned_by_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL;

COMMENT ON COLUMN work_assignments.assigned_by_staff_id IS
  'Staff who handed this work over. NULL = not recorded (every row created before 2026-08-08). Never backfilled — see the birth migration.';

-- The "what did I hand off" read: one staffer''s outgoing work, newest first.
CREATE INDEX IF NOT EXISTS idx_work_assignments_assigned_by
  ON work_assignments (organization_id, assigned_by_staff_id, status, assigned_at DESC)
  WHERE assigned_by_staff_id IS NOT NULL;
