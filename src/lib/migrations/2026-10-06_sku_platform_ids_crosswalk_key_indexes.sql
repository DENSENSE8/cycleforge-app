-- migrate:no-transaction
-- 2026-10-06_sku_platform_ids_crosswalk_key_indexes.sql
--
-- WHAT
--   Two partial expression indexes on sku_platform_ids for the platform
--   crosswalk lookup (src/lib/manuals/paperwork-match-sql.ts —
--   platformCrosswalkCatalogIdSql), one per crosswalk key:
--     (organization_id, skuKeySql(platform_item_id)) WHERE sku_catalog_id IS NOT NULL
--     (organization_id, skuKeySql(platform_sku))     WHERE sku_catalog_id IS NOT NULL
--   Each expression is skuKeySql copied character-for-character, so the
--   planner matches it against the lookup's `lcsp.<column>` expressions; the
--   partial predicate is implied by the lookup's `sku_catalog_id IS NOT NULL`.
--
-- WHY
--   Release gate G2 (src/lib/orders/g2-paperwork-sql.ts) resolves each line's
--   catalog id through that correlated subquery, once per order line. Without
--   these indexes every evaluation walks the org's sku_platform_ids rows and
--   runs the normalising regexp on each (the caged list went ~58 → 293 ms when
--   G2 adopted the crosswalk). With them, each OR arm is an index probe and the
--   two arms combine as a BitmapOr.
--
-- SAFETY
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS — no write lock, idempotent, no
--   data touched. The runner applies this file outside a transaction on a
--   direct session (first line). sku_platform_ids is small (6,583 rows,
--   281 mapped, 6.7 MB on 2026-10-06), so each build is sub-second; the
--   partial indexes hold only the mapped rows. Both lead with
--   organization_id (per-org lookups, tenant-isolated table).
--
-- ROLLBACK (no trailing `;` here: the no-transaction runner splits on `;` at line end)
--   DROP INDEX CONCURRENTLY IF EXISTS idx_sku_platform_ids_crosswalk_item_key
--   DROP INDEX CONCURRENTLY IF EXISTS idx_sku_platform_ids_crosswalk_sku_key
--
-- VERIFY
--   EXPLAIN a G2 read (e.g. the caged list): the crosswalk SubPlan shows a
--   BitmapOr of Bitmap Index Scans on idx_sku_platform_ids_crosswalk_item_key
--   and idx_sku_platform_ids_crosswalk_sku_key, no Seq Scan / per-row Filter
--   on sku_platform_ids.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sku_platform_ids_crosswalk_item_key
  ON sku_platform_ids (organization_id, (regexp_replace(UPPER(TRIM(COALESCE(platform_item_id, ''))), '[^A-Z0-9]', '', 'g')))
  WHERE sku_catalog_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sku_platform_ids_crosswalk_sku_key
  ON sku_platform_ids (organization_id, (regexp_replace(UPPER(TRIM(COALESCE(platform_sku, ''))), '[^A-Z0-9]', '', 'g')))
  WHERE sku_catalog_id IS NOT NULL;
