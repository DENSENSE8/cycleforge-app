-- ============================================================================
-- 2026-09-26_brands_2_sku_catalog_brand.sql — sku_catalog.brand_id / confidence / source
-- ============================================================================
-- Sidebar Phase 1: brand is an attribute of the catalog row. Readers join
-- product_brands ONLY through skuBrandJoinOnSql / SKU_BRAND_JOIN_ON_SQL
-- (src/lib/sku/sku-identity-law.ts), which is org-scoped and requires
-- brand_confidence >= 0.90 — so a guess can never pass as a fact.
--
--   • brand_id INTEGER NULL — composite same-org FK
--     (organization_id, brand_id) → product_brands (organization_id, id);
--     deleting a brand clears brand_id only (SET NULL column list, PG15+).
--     May point at a product_line (Wave under Bose); roll-ups walk the tree.
--   • partial index (organization_id, brand_id) WHERE brand_id IS NOT NULL —
--     int4eq/uuid_eq are leakproof, so "SKUs of brand X" is an Index Cond
--     under forced RLS as app_tenant (phase0-findings §Schema 0).
--   • brand_confidence NUMERIC(3,2) in [0,1]; brand_source TEXT + named CHECK:
--       zoho (1.00) · title (0.95) · product_line (0.90) · parent (0.90)
--       · listing (0.60) · compat (0.30) · operator (human-set / approved)
--       · agent. brand_id, confidence and source are all-or-nothing.
--   Values are written ONLY by scripts/brands-backfill.ts and the brand
--   review-queue apply path (src/lib/brands/store.ts), never in a migration.
--
-- Safety gating: additive nullable columns + a CHECK every existing row
-- satisfies (all three NULL). sku_catalog is already FORCE-RLS'd; no writer
-- changes. The search-outbox trigger re-cut that watches brand_id lands in
-- 2026-09-26_brands_4_search_docs_brand.sql.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_sku_catalog_org_brand;
--   ALTER TABLE sku_catalog DROP CONSTRAINT IF EXISTS sku_catalog_brand_fk;
--   ALTER TABLE sku_catalog DROP CONSTRAINT IF EXISTS sku_catalog_brand_source_chk;
--   ALTER TABLE sku_catalog DROP CONSTRAINT IF EXISTS sku_catalog_brand_confidence_chk;
--   ALTER TABLE sku_catalog DROP CONSTRAINT IF EXISTS sku_catalog_brand_triplet_chk;
--   ALTER TABLE sku_catalog DROP COLUMN IF EXISTS brand_source,
--                           DROP COLUMN IF EXISTS brand_confidence,
--                           DROP COLUMN IF EXISTS brand_id;
--
-- VERIFY (after apply):
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'sku_catalog' AND column_name LIKE 'brand%';
--   SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_sku_catalog_org_brand';
-- ============================================================================

BEGIN;

ALTER TABLE sku_catalog ADD COLUMN IF NOT EXISTS brand_id INTEGER;
ALTER TABLE sku_catalog ADD COLUMN IF NOT EXISTS brand_confidence NUMERIC(3,2);
ALTER TABLE sku_catalog ADD COLUMN IF NOT EXISTS brand_source TEXT;

DO $$ BEGIN
  ALTER TABLE sku_catalog ADD CONSTRAINT sku_catalog_brand_fk
    FOREIGN KEY (organization_id, brand_id)
    REFERENCES product_brands (organization_id, id)
    ON DELETE SET NULL (brand_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE sku_catalog ADD CONSTRAINT sku_catalog_brand_confidence_chk
    CHECK (brand_confidence IS NULL OR (brand_confidence >= 0 AND brand_confidence <= 1));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE sku_catalog ADD CONSTRAINT sku_catalog_brand_source_chk
    CHECK (brand_source IS NULL OR brand_source IN
      ('zoho', 'title', 'product_line', 'parent', 'listing', 'compat', 'operator', 'agent'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A brand without provenance is exactly the "guess passing as a fact" this
-- column set exists to prevent. The FK's SET NULL clears only brand_id on a
-- brand delete, so confidence/source may outlive it — never the reverse.
DO $$ BEGIN
  ALTER TABLE sku_catalog ADD CONSTRAINT sku_catalog_brand_triplet_chk
    CHECK (brand_id IS NULL OR (brand_confidence IS NOT NULL AND brand_source IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_sku_catalog_org_brand
  ON sku_catalog (organization_id, brand_id)
  WHERE brand_id IS NOT NULL;

COMMENT ON COLUMN sku_catalog.brand_id IS
  'product_brands.id (same org; may be a product_line). A fact only when brand_confidence >= 0.90 — read via skuBrandJoinOnSql.';
COMMENT ON COLUMN sku_catalog.brand_confidence IS
  '0–1. >= 0.90 auto-applied or human-confirmed fact; below that the value is a proposal and never surfaces.';
COMMENT ON COLUMN sku_catalog.brand_source IS
  'zoho | title | product_line | parent | listing | compat | operator | agent — provenance of brand_id.';

COMMIT;
