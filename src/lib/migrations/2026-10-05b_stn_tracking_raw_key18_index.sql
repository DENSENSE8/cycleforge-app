-- migrate:no-transaction
-- 2026-10-05b_stn_tracking_raw_key18_index.sql
--
-- WHAT
--   idx_stn_tracking_raw_key18_col ON shipping_tracking_numbers (tracking_raw_key18),
--   the column added by 2026-10-05_stn_tracking_raw_key18_column.sql, then ANALYZE.
--
-- WHY
--   The key-18 order-match arm (src/lib/neon/packer-order-match.ts) compares
--   ord_stn.tracking_raw_key18 to the scan's key computed in an OFFSET 0
--   subquery — a column = column texteq, leakproof, so the probe is an index
--   scan as app_tenant under RLS as well as as owner (outbound.shipped facet
--   statement 2.3-3.1 s -> ~0.3 s as app_tenant, prototype 2026-10-05).
--   Not partial: the column is non-null for every row (tracking_number_raw is
--   NOT NULL) and a plain index needs no predicate proof under RLS.
--
-- SAFETY
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS — no write lock, idempotent.
--
-- ROLLBACK
--   DROP INDEX CONCURRENTLY IF EXISTS idx_stn_tracking_raw_key18_col;
--
-- VERIFY
--   SELECT indisvalid FROM pg_index WHERE indexrelid = 'idx_stn_tracking_raw_key18_col'::regclass;  -- t
--   EXPLAIN the order-match arm: Index Scan using idx_stn_tracking_raw_key18_col on ord_stn.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stn_tracking_raw_key18_col
  ON shipping_tracking_numbers (tracking_raw_key18);

ANALYZE shipping_tracking_numbers;
