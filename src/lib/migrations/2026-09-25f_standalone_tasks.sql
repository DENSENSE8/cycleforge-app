-- 2026-09-25f_standalone_tasks.sql
-- A task no longer has to be ABOUT a record. Operators create plain tasks
-- ("Call the carrier about the Friday pickup") with no order, carton or ticket;
-- linked records stay optional through work_assignment_links.
--
--   1. work_assignments.entity_type / entity_id become nullable, but ONLY for
--      FOLLOW_UP rows, and only together. Station work (every other work_type)
--      still must name its entity — the CHECK enforces both rules.
--   2. staff_inbox_items may anchor on 'task' (entity_id = work_assignments.id)
--      so a standalone task still reaches each assignee's inbox. Record tasks
--      keep anchoring on their record, exactly as before.
--
-- SAFETY: loosening only. Existing rows all carry an entity, so the new CHECK
-- validates against current data. Station readers filter on work_type /
-- entity_type and never see a NULL-anchored FOLLOW_UP row; the entity delete
-- trigger matches entity_type = <label>, which a NULL never satisfies.
--
-- ROLLBACK (only once no standalone task exists):
--   ALTER TABLE work_assignments DROP CONSTRAINT IF EXISTS work_assignments_entity_anchor_chk;
--   ALTER TABLE work_assignments ALTER COLUMN entity_type SET NOT NULL;
--   ALTER TABLE work_assignments ALTER COLUMN entity_id SET NOT NULL;
--   Re-create staff_inbox_items_entity_type_chk without 'task' after deleting 'task' rows.
--
-- VERIFY:
--   SELECT count(*) FROM work_assignments WHERE entity_type IS NULL AND work_type <> 'FOLLOW_UP'; -- 0

ALTER TABLE work_assignments ALTER COLUMN entity_type DROP NOT NULL;
ALTER TABLE work_assignments ALTER COLUMN entity_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_assignments_entity_anchor_chk'
    AND conrelid = 'work_assignments'::regclass) THEN
    ALTER TABLE work_assignments ADD CONSTRAINT work_assignments_entity_anchor_chk CHECK (
      (entity_type IS NULL) = (entity_id IS NULL)
      AND (entity_type IS NOT NULL OR work_type = 'FOLLOW_UP')
    );
  END IF;
END $$;

ALTER TABLE staff_inbox_items DROP CONSTRAINT IF EXISTS staff_inbox_items_entity_type_chk;
ALTER TABLE staff_inbox_items ADD CONSTRAINT staff_inbox_items_entity_type_chk CHECK (
  entity_type = ANY (ARRAY['receiving', 'receiving_line', 'serial_unit', 'order', 'fba_shipment',
                           'repair', 'warranty_claim', 'support_ticket', 'task'])
);
