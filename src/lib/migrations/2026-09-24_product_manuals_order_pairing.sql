-- product_manuals.order_id — pair a manual / packing list / any paperwork to ONE order.
--
-- What + why: paperwork (product_manuals rows: manuals, packing lists, PL + M…)
-- already pairs to an item number (`item_number`) and a SKU (`sku` +
-- `sku_catalog_id`) so every recurring order of that item / SKU resolves it.
-- The owner also needs paperwork that belongs to a single order. This adds the
-- third pairing key to the SAME row — no second pairing table. Resolution
-- (src/lib/manuals/paperwork-pairing.ts): order > item number > SKU; a row
-- shows once, under the most specific key it matches.
--
-- Safety gating: additive nullable column + partial index. product_manuals is
-- already FORCE RLS (2026-06-22g); every writer stamps organization_id. No
-- backfill — existing rows keep their item / SKU pairing and order_id NULL.
-- ON DELETE SET NULL: deleting an order never deletes a stored file; the row
-- simply stops resolving for that order.
--
-- Rollback:
--   DROP INDEX IF EXISTS idx_product_manuals_active_order;
--   ALTER TABLE product_manuals DROP COLUMN IF EXISTS order_id;
--
-- Verify:
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'product_manuals' AND column_name = 'order_id';

ALTER TABLE product_manuals
  ADD COLUMN IF NOT EXISTS order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_product_manuals_active_order
  ON product_manuals (organization_id, order_id)
  WHERE is_active = TRUE AND order_id IS NOT NULL;
