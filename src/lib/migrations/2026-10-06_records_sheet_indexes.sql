-- migrate:no-transaction
-- 2026-10-06_records_sheet_indexes.sql
--
-- WHAT
--   Two org-leading indexes on orders for the Records sheet (docs/refactors/
--   records/PROMPT-records-sheet-handoff-2026-10-06.md §3B.3), both keyed on
--   Placed-else-Imported — placedElseImportedSql('o') in
--   src/lib/orders/order-dates.ts, copied character-for-character so the
--   planner matches the sheet's ORDER BY / window predicate:
--     idx_orders_org_placed
--       (organization_id, COALESCE(order_date, created_at) DESC, id DESC)
--       — the default read: newest 200 in a date window. An ordered index
--       scan stops after 200 rows instead of sorting the whole org.
--     idx_orders_org_source_placed
--       (organization_id, account_source, COALESCE(order_date, created_at) DESC)
--       — the account_source (platform) filter: the same ordered early stop
--       inside one source, and the sidebar's per-source live counts as an
--       index range instead of a seq scan of the org. Supersedes the
--       requested (organization_id, account_source): equality on the first
--       two columns serves the same lookups.
--   Then ANALYZE orders, so the planner has statistics for the new
--   expression column (5,404 rows).
--
-- WHY / MEASURED (EXPLAIN (ANALYZE, BUFFERS), production, 2026-10-06, org …01 = 5,195 of 5,404 rows)
--   Q1 newest 200, 6-month window, ORDER BY COALESCE(order_date, created_at) DESC, id DESC:
--      Seq Scan on orders (3,903 rows kept, 1,501 removed) → top-N heapsort,
--      308 shared buffers, 5.78 ms execution (2.29 ms planning).
--   Q2 same + account_source = 'walmart':
--      Bitmap Index Scan idx_orders_account_source (global, not org-leading)
--      → org/date as Filter → quicksort, 13 buffers, 0.58 ms.
--   Q3 sidebar per-source counts in the 6-month window (GROUP BY account_source):
--      Seq Scan → HashAggregate, 308 buffers, 3.25 ms.
--   After [INFERENCE — not measured: the probe is read-only and hypopg is not
--   installed]: Q1 becomes an Index Scan on idx_orders_org_placed reading
--   ~200 index entries; Q2/Q3 range-scan idx_orders_org_source_placed.
--
-- NOT ADDED (requested candidates, each judged against the live index set)
--   orders (organization_id, order_date) and (organization_id, created_at):
--     the sheet sorts and windows on COALESCE(order_date, created_at); a
--     single-column key cannot serve that expression. idx_orders_org_placed
--     replaces both. (order_date alone keeps the global idx_orders_order_date.)
--   orders (organization_id, customer_id), (organization_id, shipment_id),
--   receiving_line (organization_id, receiving_id), (organization_id, shipment_id),
--   receiving_carton (organization_id, shipment_id):
--     each second column is a surrogate id that belongs to exactly one org
--     (customers / shipping_tracking_numbers / receiving_carton rows are
--     org-owned), so the org prefix cannot narrow the row set; the existing
--     idx_orders_customer_id, idx_orders_shipment_id,
--     idx_receiving_lines_receiving_id, idx_receiving_lines_shipment_id,
--     idx_receiving_shipment_id already return exactly those rows (orders by
--     customer: Index Scan idx_orders_customer_id, 0.07 ms).
--   shipment_links (organization_id, owner_type, owner_id): already covered
--     by ux_shipment_links_owner_shipment (its leading three columns).
--
-- SAFETY
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS — no write lock, idempotent, no
--   data touched. The runner applies this file outside a transaction on a
--   direct session (first line). orders is 5,404 rows: each build is
--   sub-second. COALESCE over two timestamptz columns is immutable, so the
--   expression is indexable.
--
-- ROLLBACK (no trailing `;` here: the no-transaction runner splits on `;` at line end)
--   DROP INDEX CONCURRENTLY IF EXISTS idx_orders_org_placed
--   DROP INDEX CONCURRENTLY IF EXISTS idx_orders_org_source_placed
--
-- VERIFY
--   EXPLAIN (ANALYZE, BUFFERS) the Q1 read above: Index Scan using
--   idx_orders_org_placed, no Sort node. With AND account_source = '<src>':
--   Index Scan using idx_orders_org_source_placed.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_org_placed
  ON orders (organization_id, (COALESCE(order_date, created_at)) DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_org_source_placed
  ON orders (organization_id, account_source, (COALESCE(order_date, created_at)) DESC);

ANALYZE orders;
