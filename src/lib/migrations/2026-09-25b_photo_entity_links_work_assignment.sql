-- ============================================================================
-- 2026-09-25b: task-desk media (photos + videos on a thrown task)
-- ============================================================================
-- Task evidence enters the photos platform the same polymorphic way as every
-- other scope: entity_type='WORK_ASSIGNMENT', entity_id=work_assignments.id,
-- link_role='primary'. Videos use the same pair in `entity_videos`
-- (2026-09-24d). Uploads ride the existing POST /api/photos/upload and
-- POST /api/photos/upload/video, which refuse an id that is not a FOLLOW_UP
-- task in the caller's org.
--
-- Per `.claude/rules/polymorphic-tables.md` (and the 2026-09-15d precedent):
-- a new discriminator value ships its widening CHECK and its parent-delete
-- trigger in the SAME migration. The TS vocabulary
-- (PHOTO_ENTITY_TYPES in src/lib/photos/types.ts) lands with this file.
--
-- `entity_videos` has no discriminator CHECK (validated at the route edge), so
-- only its parent-delete behaviour is added here: a generic
-- `fn_delete_entity_videos_on_parent_delete(TG_ARGV[0])`, the video twin of
-- `fn_delete_photos_on_parent_delete`. It deletes ROWS ONLY — the GCS objects
-- under `{org}/videos/tasks/{id}/` are NOT removed by any trigger (no trigger
-- in this schema reaches GCS); they are orphaned bytes a bucket sweep must
-- collect. `DELETE /api/photos/videos/[id]` is the path that removes a video's
-- object as well as its row.
--
-- Re-runnable: every step is IF EXISTS / OR REPLACE guarded.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_delete_entity_videos_on_work_assignment_delete ON work_assignments;
--   DROP FUNCTION IF EXISTS fn_delete_entity_videos_on_parent_delete();
--   DROP TRIGGER IF EXISTS trg_delete_photos_on_work_assignment_delete ON work_assignments;
--   ALTER TABLE photo_entity_links DROP CONSTRAINT chk_photo_entity_links_entity_type;
--   ALTER TABLE photo_entity_links ADD CONSTRAINT chk_photo_entity_links_entity_type
--     CHECK (entity_type IN ('RECEIVING','RECEIVING_LINE','PACKER_LOG','SERIAL_UNIT',
--                            'SKU','SKU_STOCK','BIN_ADJUSTMENT','SHARE_PACK',
--                            'ZENDESK_TICKET','STAFF','REPAIR_SERVICE'));
--   -- (safe only while zero WORK_ASSIGNMENT links exist; check first)
-- Verify:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'chk_photo_entity_links_entity_type';
--   SELECT tgname FROM pg_trigger
--    WHERE tgname IN ('trg_delete_photos_on_work_assignment_delete',
--                     'trg_delete_entity_videos_on_work_assignment_delete');
-- ============================================================================

BEGIN;

ALTER TABLE photo_entity_links
  DROP CONSTRAINT IF EXISTS chk_photo_entity_links_entity_type;

ALTER TABLE photo_entity_links
  ADD CONSTRAINT chk_photo_entity_links_entity_type
    CHECK (entity_type IN (
      'RECEIVING', 'RECEIVING_LINE', 'PACKER_LOG', 'SERIAL_UNIT',
      'SKU', 'SKU_STOCK', 'BIN_ADJUSTMENT',
      'SHARE_PACK', 'ZENDESK_TICKET',
      'STAFF',
      'REPAIR_SERVICE',
      'WORK_ASSIGNMENT'
    ));

-- Deleting a task removes its evidence photos (bytes + links), the same
-- cascade every other nameable parent already has. `fn_delete_photos_on_parent_delete`
-- dispatches on TG_ARGV[0] (2026-06-21 Phase E).
DROP TRIGGER IF EXISTS trg_delete_photos_on_work_assignment_delete ON work_assignments;
CREATE TRIGGER trg_delete_photos_on_work_assignment_delete
AFTER DELETE ON work_assignments
FOR EACH ROW EXECUTE FUNCTION fn_delete_photos_on_parent_delete('WORK_ASSIGNMENT');

-- Video rows on a deleted parent. Generic on TG_ARGV[0] so the next entity
-- that gains videos is one CREATE TRIGGER, no new function. Rows only — see
-- the header on GCS objects.
CREATE OR REPLACE FUNCTION fn_delete_entity_videos_on_parent_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM entity_videos
   WHERE organization_id = OLD.organization_id
     AND entity_type = TG_ARGV[0]
     AND entity_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_delete_entity_videos_on_work_assignment_delete ON work_assignments;
CREATE TRIGGER trg_delete_entity_videos_on_work_assignment_delete
AFTER DELETE ON work_assignments
FOR EACH ROW EXECUTE FUNCTION fn_delete_entity_videos_on_parent_delete('WORK_ASSIGNMENT');

COMMIT;
