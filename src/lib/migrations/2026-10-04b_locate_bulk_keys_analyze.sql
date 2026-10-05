-- 2026-10-04b_locate_bulk_keys_analyze.sql
--
-- WHAT
--   ANALYZE the three tables 2026-10-04_locate_bulk_keys.sql indexed, so the
--   planner has statistics for the new index EXPRESSIONS.
--
-- WHY
--   Postgres collects an expression index's statistics only when its table is
--   next analyzed. Until then every `<expression> = ref` join is costed at the
--   default selectivity (~5.5k rows per probe on orders), and the bulk locate
--   statement keeps the seq-scan + merge-join plan: measured 2026-10-04 on the
--   213-ref paste, 222 ms with the indexes valid but unanalyzed vs 26 ms on the
--   same statement once the index paths are taken (planner forced in a
--   read-only session). Autovacuum would get there eventually (orders was
--   last auto-analyzed 2026-09-30); this makes it immediate wherever the index
--   migration runs.
--
-- SAFETY
--   ANALYZE reads a sample and rewrites pg_statistic only — no data or schema
--   change, a SHARE UPDATE EXCLUSIVE lock (does not block reads or writes).
--   Idempotent.
--
-- ROLLBACK
--   None needed (statistics only).
--
-- VERIFY
--   SELECT count(*) FROM pg_stats WHERE tablename LIKE 'idx_orders_org_%';  -- > 0
--   EXPLAIN the outbound refs statement (buildOutboundRefsSql): Index Scan
--   using idx_orders_org_order_key4 / idx_stn_norm_key18 in the candidate CTEs.

ANALYZE orders;
ANALYZE shipping_tracking_numbers;
ANALYZE zoho_po_mirror;
