-- Canonical product-level operational handling facts for outbound work.
--
-- These deliberately do not reuse sku_catalog.notes: free-text packing guidance
-- cannot safely manufacture a Hazmat, Oversized, or Two-person-lift instruction
-- on a floor row. The closed, tenant-owned text[] vocabulary is read by the
-- shared outbound handling-facts law and projected through Orders/Picks/Packing.

ALTER TABLE sku_catalog
  ADD COLUMN IF NOT EXISTS handling_flags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE sku_catalog
SET handling_flags = ARRAY[]::TEXT[]
WHERE handling_flags IS NULL;

ALTER TABLE sku_catalog
  DROP CONSTRAINT IF EXISTS sku_catalog_handling_flags_chk;

ALTER TABLE sku_catalog
  ADD CONSTRAINT sku_catalog_handling_flags_chk
  CHECK (handling_flags <@ ARRAY['hazmat', 'oversized', 'two_person_lift']::TEXT[]);

COMMENT ON COLUMN sku_catalog.handling_flags IS
  'Closed product-level outbound handling facts: hazmat, oversized, two_person_lift. Never derive from free-text notes.';
