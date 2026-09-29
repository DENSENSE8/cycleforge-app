-- Restore ORDER after later discriminator migrations accidentally narrowed the
-- photo_entity_links CHECK. The July ORDER migration is in the ledger, but the
-- August STAFF and September REPAIR/WORK_ASSIGNMENT rewrites omitted ORDER.

BEGIN;

ALTER TABLE photo_entity_links
  DROP CONSTRAINT IF EXISTS chk_photo_entity_links_entity_type;

ALTER TABLE photo_entity_links
  ADD CONSTRAINT chk_photo_entity_links_entity_type
    CHECK (entity_type IN (
      'RECEIVING', 'RECEIVING_LINE', 'PACKER_LOG', 'SERIAL_UNIT',
      'ORDER', 'SKU', 'SKU_STOCK', 'BIN_ADJUSTMENT',
      'SHARE_PACK', 'ZENDESK_TICKET',
      'STAFF', 'REPAIR_SERVICE', 'WORK_ASSIGNMENT'
    ));

-- Idempotently retain parent-delete integrity even on databases where the July
-- migration was recorded but its later constraint value was lost.
DROP TRIGGER IF EXISTS trg_delete_photos_on_order_delete ON orders;
CREATE TRIGGER trg_delete_photos_on_order_delete
AFTER DELETE ON orders
FOR EACH ROW EXECUTE FUNCTION fn_delete_photos_on_parent_delete('ORDER');

COMMIT;
