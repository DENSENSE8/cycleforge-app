-- photo_entity_links.sort_order — operator-chosen photo order per entity.
--
-- What + why: the stock record (desktop + mobile) lets the operator reorder a
-- SKU's photos and pick the main (cover) photo. Order is a property of the
-- link (the same photo may sit on several entities), so it lives here.
-- Display order for an entity's photos is `sort_order NULLS LAST, photo_id`;
-- the first is the cover. Written by PATCH /api/photos/links
-- (`reorderEntityPhotos`), 1-based.
--
-- Safety gating: additive nullable column, no default, no backfill — every
-- existing link reads NULL and keeps its prior photo_id order. The table is
-- already tenant-scoped (organization_id NOT NULL); the index leads with it.
--
-- Rollback: DROP INDEX IF EXISTS idx_photo_entity_links_entity_sort;
--           ALTER TABLE photo_entity_links DROP COLUMN IF EXISTS sort_order;
--
-- Verify: SELECT column_name FROM information_schema.columns
--          WHERE table_name = 'photo_entity_links' AND column_name = 'sort_order';

ALTER TABLE photo_entity_links ADD COLUMN IF NOT EXISTS sort_order integer;

CREATE INDEX IF NOT EXISTS idx_photo_entity_links_entity_sort
  ON photo_entity_links (organization_id, entity_type, entity_id, sort_order);
