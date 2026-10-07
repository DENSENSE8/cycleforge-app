-- migrate:no-transaction
-- 2026-10-06_sku_catalog_canonical_key_index.sql
--
-- WHAT
--   Expression index on sku_catalog (organization_id, fn_normalize_sku(sku)).
--   The expression is character-for-character SKU_CANONICAL_KEY_MATCH_SQL's
--   column side (src/lib/inventory/resolve-sku-catalog.ts), so the planner
--   matches it for the label/unit resolver and /api/get-title-by-sku.
--
-- WHY
--   Label/unit resolution matches a SKU by its canonical key (fn_normalize_sku,
--   2026-06-06b_pending_skus.sql) in both directions — `89-P-1` finds
--   `00089-P-1`, `01103:B95` finds `1103:B95` — with an ambiguity guard in
--   pickSkuCatalogMatch. Without this index each lookup runs the plpgsql
--   normalizer over every catalog row in the org.
--
-- SAFETY
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS — no write lock, idempotent, no
--   data touched. fn_normalize_sku is IMMUTABLE, so it is indexable. Not
--   UNIQUE on purpose: `00036` (Guitar Hero III) and `36` (a marker pack) are
--   two Zoho-owned products sharing one canonical key; the resolver refuses to
--   pick between them rather than the schema refusing one of them.
--
-- ROLLBACK (no trailing `;` here: the no-transaction runner splits on `;` at line end)
--   DROP INDEX CONCURRENTLY IF EXISTS idx_sku_catalog_org_canonical_sku

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sku_catalog_org_canonical_sku
  ON sku_catalog (organization_id, fn_normalize_sku(sku));
