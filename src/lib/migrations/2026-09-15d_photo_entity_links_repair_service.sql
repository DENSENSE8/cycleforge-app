-- ============================================================================
-- 2026-09-15d: repair-service evidence photos
-- ============================================================================
-- Repair photos enter the photos platform the same polymorphic way as every
-- other scope: entity_type='REPAIR_SERVICE', entity_id=repair_service.id,
-- link_role='primary'. These are the "internal insurance" drop-off condition
-- shots taken at the counter and by the tech closing the loop — captured on
-- /m/rs/{id}, displayed in the media library alongside unboxing evidence.
--
-- Per `.claude/rules/polymorphic-tables.md` (and the 2026-08-01e precedent):
-- a new discriminator value ships its widening CHECK and its parent-delete
-- trigger in the SAME migration. The TS vocabulary
-- (PHOTO_ENTITY_TYPES in src/lib/photos/types.ts) lands with this file.
--
-- Re-runnable: every step is IF EXISTS / IF NOT EXISTS guarded.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_delete_photos_on_repair_service_delete ON repair_service;
--   ALTER TABLE photo_entity_links DROP CONSTRAINT chk_photo_entity_links_entity_type;
--   ALTER TABLE photo_entity_links ADD CONSTRAINT chk_photo_entity_links_entity_type
--     CHECK (entity_type IN ('RECEIVING','RECEIVING_LINE','PACKER_LOG','SERIAL_UNIT',
--                            'SKU','SKU_STOCK','BIN_ADJUSTMENT','SHARE_PACK',
--                            'ZENDESK_TICKET','STAFF'));
--   -- (safe only while zero REPAIR_SERVICE links exist; check first)
-- Verify:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'chk_photo_entity_links_entity_type';
--   SELECT tgname FROM pg_trigger WHERE tgname = 'trg_delete_photos_on_repair_service_delete';
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
      'REPAIR_SERVICE'
    ));

-- Deleting a repair removes its evidence photos (bytes + links), the same
-- cascade every other nameable parent already has. `fn_delete_photos_on_parent_delete`
-- dispatches on TG_ARGV[0] (2026-06-21 Phase E).
DROP TRIGGER IF EXISTS trg_delete_photos_on_repair_service_delete ON repair_service;
CREATE TRIGGER trg_delete_photos_on_repair_service_delete
AFTER DELETE ON repair_service
FOR EACH ROW EXECUTE FUNCTION fn_delete_photos_on_parent_delete('REPAIR_SERVICE');

COMMIT;
