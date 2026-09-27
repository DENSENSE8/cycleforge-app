-- 2026-09-26_perf_01_sal_order_grain_columns.sql
--
-- WHAT
--   station_activity_logs gains two STORED generated columns over `metadata`
--   and one org-led partial btree for each:
--     order_row_id bigint  = metadata->>'order_row_id' when it is 1-18 digits, else NULL
--     ext_order_id text    = metadata->>'order_id' (the marketplace order number)
--     idx_sal_org_type_row_id    (organization_id, activity_type, order_row_id) WHERE order_row_id IS NOT NULL
--     idx_sal_org_type_ext_order (organization_id, activity_type, ext_order_id) WHERE ext_order_id IS NOT NULL
--
-- WHY
--   The order-grain membership probe (src/lib/orders/order-grain-sql.ts,
--   sqlOrderHasTechScan / sqlOrderHasPackScan) runs once per order inside
--   /api/orders, /api/orders/queue-counts and /api/orders/desk-counts. Those
--   paths run as app_tenant under FORCE RLS, where only LEAKPROOF operators can
--   be index conditions. jsonb `->>`, `~` and the `::int` cast are not
--   leakproof, so the 2026-08-21e expression indexes are never used there and
--   every probe read the org's whole SAL table:
--     SubPlan -> Index Scan using idx_station_activity_logs_organization,
--     Rows Removed by Filter: 43,464, loops=405
--     queue-counts main: 10,978 ms
--     (docs/refactors/sidebar/perf-explain/queue_counts_main.before.txt)
--   int8/int4 and text equality (int84eq, texteq) ARE leakproof: with plain
--   columns each OR arm of the probe is an Index Cond and the arms combine as a
--   BitmapOr with idx_station_activity_logs_shipment_id — the plan the owner
--   role already gets, measured 37.5 ms (phase0-findings §2.1).
--
--   bigint with a {1,18}-digit guard: the generated value can never make an
--   INSERT fail (an int4 cast of a long digit string would throw), and a longer
--   value is not a row id (NULL = unattributed, as before).
--
-- SAFETY
--   ADD COLUMN ... GENERATED ALWAYS AS ... STORED rewrites the table under
--   ACCESS EXCLUSIVE: 43.7k rows / 26 MB on the dev branch, a few seconds.
--   Nothing writes these columns (generated columns reject explicit values) and
--   nothing inserts `SELECT *` into this table. Plain CREATE INDEX, not
--   CONCURRENTLY: scripts/run-pending-migrations.mjs wraps each file in
--   BEGIN/COMMIT.
--   ORDER: the code that reads the columns (order-grain-sql.ts) ships in the
--   same change and fails ("column sal.order_row_id does not exist") until this
--   is applied — apply BEFORE deploying it. The old jsonb expression indexes are
--   dropped by 2026-09-26_perf_02 once that code is live.
--
-- VERIFY
--   SELECT count(*) FILTER (WHERE order_row_id IS NOT NULL) AS row_ids,
--          count(*) FILTER (WHERE ext_order_id IS NOT NULL) AS ext_ids
--     FROM station_activity_logs;
--   -- dev 2026-09-26 before apply: metadata carries 1,261 numeric order_row_id
--   -- and 4,687 order_id values; the columns must report the same.
--   scripts/perf-explain-after.sh  -> queue_counts_main.after.txt shows BitmapOr
--   over idx_sal_org_type_row_id / idx_sal_org_type_ext_order.
--
-- ROLLBACK
--   DROP INDEX IF EXISTS idx_sal_org_type_row_id;
--   DROP INDEX IF EXISTS idx_sal_org_type_ext_order;
--   ALTER TABLE station_activity_logs
--     DROP COLUMN IF EXISTS order_row_id,
--     DROP COLUMN IF EXISTS ext_order_id;
--   (and revert src/lib/orders/order-grain-sql.ts to the metadata spelling)

ALTER TABLE station_activity_logs
  ADD COLUMN IF NOT EXISTS order_row_id bigint
    GENERATED ALWAYS AS (
      CASE
        WHEN (metadata->>'order_row_id') ~ '^[0-9]{1,18}$'
          THEN (metadata->>'order_row_id')::bigint
      END
    ) STORED,
  ADD COLUMN IF NOT EXISTS ext_order_id text
    GENERATED ALWAYS AS (metadata->>'order_id') STORED;

COMMENT ON COLUMN station_activity_logs.order_row_id IS
  'orders.id this activity is attributed to (metadata->>''order_row_id'' when 1-18 digits). Typed copy so the order-grain probe in src/lib/orders/order-grain-sql.ts is a leakproof index condition under RLS.';
COMMENT ON COLUMN station_activity_logs.ext_order_id IS
  'Marketplace order number this activity is attributed to (metadata->>''order_id''). Typed copy for the order-grain probe; compared to orders.order_id.';

CREATE INDEX IF NOT EXISTS idx_sal_org_type_row_id
  ON station_activity_logs (organization_id, activity_type, order_row_id)
  WHERE order_row_id IS NOT NULL;

COMMENT ON INDEX idx_sal_org_type_row_id IS
  'Order-grain SAL membership, row-id arm (sal.order_row_id = o.id). One BitmapOr arm with idx_sal_org_type_ext_order and idx_station_activity_logs_shipment_id; every key column is compared with a leakproof operator, so it serves app_tenant under RLS.';

CREATE INDEX IF NOT EXISTS idx_sal_org_type_ext_order
  ON station_activity_logs (organization_id, activity_type, ext_order_id)
  WHERE ext_order_id IS NOT NULL;

COMMENT ON INDEX idx_sal_org_type_ext_order IS
  'Order-grain SAL membership, marketplace-order arm (sal.ext_order_id = o.order_id). Pairs with idx_sal_org_type_row_id.';
