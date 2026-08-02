-- ============================================================================
-- 2026-08-01e: staff profile photos
-- ============================================================================
-- Operators upload one personal photo per staff profile; it becomes the avatar
-- everywhere staff identity is shown (spine footer, sign-in picker, timelines,
-- serial journeys, admin identity + schedule pills), falling back to the
-- staff-colour initials when absent.
--
-- Two additive changes:
--
--   1. `staff.avatar_photo_id` — a PHOTO ID, never a raw GCS URL. Bytes stay
--      behind the photos platform (`photo_storage` + `/api/photos/{id}/content`,
--      signed/streamed and org-scoped), exactly like receiving evidence. A URL
--      column here would be a second, unsigned way to reach tenant bytes.
--      ON DELETE SET NULL: deleting the photo row must clear the pointer, not
--      orphan it — a dangling id renders as a broken mark on every surface.
--
--   2. `STAFF` joins the `photo_entity_links` discriminator, so a profile photo
--      is linked the same polymorphic way as every other scope
--      (entity_type='STAFF', entity_id=staff.id, link_role='primary'), plus the
--      matching parent-delete trigger. Per `.claude/rules/polymorphic-tables.md`
--      a new discriminator value ships its trigger in the SAME migration —
--      `work_assignments` shipped 5 values and 2 triggers and silently had no
--      delete-time behaviour for months.
--
-- Re-runnable: every step is IF EXISTS / IF NOT EXISTS guarded.
-- ============================================================================

BEGIN;

-- ─── 1. staff.avatar_photo_id ────────────────────────────────────────────────

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS avatar_photo_id BIGINT;

DO $$ BEGIN
  ALTER TABLE staff
    ADD CONSTRAINT fk_staff_avatar_photo
      FOREIGN KEY (avatar_photo_id) REFERENCES photos(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ON DELETE SET NULL scans the referencing side on every photo delete; without
-- this index that is a seq scan of `staff` per deleted photo.
CREATE INDEX IF NOT EXISTS idx_staff_avatar_photo
  ON staff (avatar_photo_id)
  WHERE avatar_photo_id IS NOT NULL;

COMMENT ON COLUMN staff.avatar_photo_id IS
  'Profile photo (photos.id). Served via /api/photos/{id}/content; NULL ⇒ render staff-colour initials.';

-- ─── 2. STAFF photo entity type ──────────────────────────────────────────────

ALTER TABLE photo_entity_links
  DROP CONSTRAINT IF EXISTS chk_photo_entity_links_entity_type;

ALTER TABLE photo_entity_links
  ADD CONSTRAINT chk_photo_entity_links_entity_type
    CHECK (entity_type IN (
      'RECEIVING', 'RECEIVING_LINE', 'PACKER_LOG', 'SERIAL_UNIT',
      'SKU', 'SKU_STOCK', 'BIN_ADJUSTMENT',
      'SHARE_PACK', 'ZENDESK_TICKET',
      'STAFF'
    ));

-- Deleting a staffer removes their profile photo (bytes + links), the same
-- cascade every other nameable parent already has. `fn_delete_photos_on_parent_delete`
-- dispatches on TG_ARGV[0] (2026-06-21 Phase E).
DROP TRIGGER IF EXISTS trg_delete_photos_on_staff_delete ON staff;
CREATE TRIGGER trg_delete_photos_on_staff_delete
AFTER DELETE ON staff
FOR EACH ROW EXECUTE FUNCTION fn_delete_photos_on_parent_delete('STAFF');

COMMIT;
