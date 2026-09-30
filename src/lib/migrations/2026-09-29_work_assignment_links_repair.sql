-- 2026-09-29_work_assignment_links_repair.sql
--
-- A task can name a REPAIR beyond its anchor (docs/HANDOFF-tasks-board-follow-ups.md §3b).
-- `work_assignment_links` gains one discriminator value:
--
--   entity_type  | entity_id                       | label
--   -------------+---------------------------------+----------------------------------
--   REPAIR       | repair_service.id               | 'RS-<repair_service.id>'
--
-- Repair is a LINK, not an anchor: anchors must also be URGENCY_TARGETS and
-- repair has no urgency storage, so `work_assignments.entity_type` is untouched.
--
-- Two changes, both on the 2026-09-25b shape:
--   1. `work_assignment_links_entity_type_chk` is dropped and re-added with
--      REPAIR in the NOT-NULL entity_id arm (DROP IF EXISTS + ADD, so a re-run
--      lands on the same constraint).
--   2. The polymorphic parent-delete trigger family gets `repair_service`:
--      deleting a repair drops the links that name it (the same
--      fn_delete_work_assignment_links_on_parent_delete, TG_ARGV 'REPAIR').
--      repair_service carries organization_id (2026-05-23), which the function
--      filters on, so the delete stays inside the deleting row's tenant.
--
-- SAFETY: widens a CHECK (every existing row satisfies the new predicate — the
-- old arms are kept verbatim) and adds one BEFORE DELETE trigger. The re-add
-- validates `work_assignment_links` (small; brief ACCESS EXCLUSIVE lock). The
-- only writer of REPAIR rows (src/lib/tasks/task-links-db.ts via
-- POST /api/tasks/[id]/links) stamps organization_id from the auth context and
-- resolves the repair in the caller's org; until this file is applied that
-- write fails the old CHECK loudly (no silent fallback). No tenancy change:
-- work_assignment_links is already FORCE RLS.
--
-- ROLLBACK:
--   BEGIN;
--   DELETE FROM work_assignment_links WHERE entity_type = 'REPAIR';
--   DROP TRIGGER IF EXISTS trg_delete_work_assignment_links_on_repair_service_delete ON repair_service;
--   ALTER TABLE work_assignment_links DROP CONSTRAINT IF EXISTS work_assignment_links_entity_type_chk;
--   ALTER TABLE work_assignment_links ADD CONSTRAINT work_assignment_links_entity_type_chk CHECK (
--     (entity_type IN ('ORDER', 'SUPPORT_TICKET') AND entity_id IS NOT NULL)
--     OR (entity_type = 'TRACKING' AND entity_id IS NULL));
--   COMMIT;
--
-- VERIFY:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'work_assignment_links_entity_type_chk';          -- REPAIR in the first arm
--   SELECT tgname FROM pg_trigger
--    WHERE tgname = 'trg_delete_work_assignment_links_on_repair_service_delete';  -- 1 row
--   Then link RS-<id> to a task from the Tasks board and GET /api/tasks/<id>/links → kind 'repair'.

BEGIN;

ALTER TABLE work_assignment_links
  DROP CONSTRAINT IF EXISTS work_assignment_links_entity_type_chk;

ALTER TABLE work_assignment_links
  ADD CONSTRAINT work_assignment_links_entity_type_chk
  CHECK (
    (entity_type IN ('ORDER', 'SUPPORT_TICKET', 'REPAIR') AND entity_id IS NOT NULL)
    OR (entity_type = 'TRACKING' AND entity_id IS NULL)
  );

DROP TRIGGER IF EXISTS trg_delete_work_assignment_links_on_repair_service_delete ON repair_service;
CREATE TRIGGER trg_delete_work_assignment_links_on_repair_service_delete
  BEFORE DELETE ON repair_service
  FOR EACH ROW
  EXECUTE FUNCTION fn_delete_work_assignment_links_on_parent_delete('REPAIR');

COMMIT;
