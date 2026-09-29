-- migrate:no-transaction
-- 2026-09-28_drop_exact_duplicate_indexes.sql
--
-- WHAT
--   Drop one index of each exact-duplicate pair (same table, columns, opclass,
--   predicate, uniqueness — found via pg_index grouping, 2026-09-28). Kept /
--   dropped (the kept twin carries the scans):
--     tech_serial_numbers    keep idx_tsn_context_sal_id (2,293,268 scans)
--                            drop idx_tech_serial_numbers_context_sal (45)
--     work_session_intervals keep idx_work_session_intervals_session (35)
--                            drop idx_work_session_intervals_org_session (0)
--     sku_management         keep idx_sku_management_base_sku
--                            drop idx_sku_management_base (both 0 scans)
--     sku_catalog            keep ix_sku_catalog_title_trgm (2026-05-25_sku_pairing_hub)
--                            drop idx_sku_catalog_product_title_trgm (2026-04-10)
--
-- WHY
--   A duplicate serves no read the twin cannot, yet every INSERT/UPDATE pays
--   for both (the GIN trgm pair on sku_catalog is the costly one). The planner
--   picks either twin arbitrarily, so dropping one changes no plan shape.
--
-- SAFETY
--   DROP INDEX CONCURRENTLY IF EXISTS — no ACCESS EXCLUSIVE on the tables, no
--   data touched, idempotent. None of the dropped names is declared in
--   src/lib/drizzle/schema.ts, so drizzle will not recreate them. The two
--   older migrations that created the dropped names use IF NOT EXISTS and are
--   already applied (immutable), so a fresh DB recreates then this drops.
--
-- VERIFY
--   SELECT indrelid::regclass, array_agg(indexrelid::regclass)
--     FROM pg_index GROUP BY indrelid, indkey::text, indclass::text,
--          coalesce(pg_get_expr(indexprs, indrelid), ''),
--          coalesce(pg_get_expr(indpred, indrelid), ''), indisunique
--   HAVING count(*) > 1;   -- only neon_auth.organization's pair remains (not ours)
--
-- ROLLBACK
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tech_serial_numbers_context_sal
--     ON tech_serial_numbers (context_station_activity_log_id)
--     WHERE context_station_activity_log_id IS NOT NULL;
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_work_session_intervals_org_session
--     ON work_session_intervals (organization_id, session_id, started_at);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sku_management_base ON sku_management (base_sku);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sku_catalog_product_title_trgm
--     ON sku_catalog USING gin (product_title gin_trgm_ops);

DROP INDEX CONCURRENTLY IF EXISTS idx_tech_serial_numbers_context_sal;
DROP INDEX CONCURRENTLY IF EXISTS idx_work_session_intervals_org_session;
DROP INDEX CONCURRENTLY IF EXISTS idx_sku_management_base;
DROP INDEX CONCURRENTLY IF EXISTS idx_sku_catalog_product_title_trgm;
