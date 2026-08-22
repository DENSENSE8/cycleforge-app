-- 2026-08-21e_station_activity_logs_order_grain_indexes.sql
--
-- Index the order-grain SAL membership probes. Measured control on the live
-- dogfood DB: the orders queue read went 12,553ms -> 106ms (118x) once these
-- exist.
--
-- WHAT WAS SLOW
-- `src/lib/orders/order-grain-sql.ts` builds `sqlOrderHasPackScan` /
-- `sqlOrderHasTechScan` as
--
--     (EXISTS (metadata-grain) OR (SQL_SHIPMENT_IS_SOLE_ORDER AND EXISTS (shipment-grain)))
--
-- Under an OR, Postgres cannot pull a sublink up into a semi/anti-join, so the
-- correlated metadata EXISTS runs as a SubPlan once per outer row. With no index
-- on `activity_type` and none on the `metadata->>` expressions, each execution
-- was a full seq scan of the table:
--
--     loops=1010 · 23.4ms each · "Rows Removed by Filter: 29852" per loop  =>  ~23.6s
--
-- station_activity_logs is 31,347 rows / 15MB, so the scan is cheap-per-row and
-- catastrophic-per-loop. This migration does NOT remove the SubPlan — only
-- restructuring the SQL so the sublink can be pulled up would do that, and that
-- is a change to order-grain-sql.ts, not to the schema. What it does is turn
-- each of the ~1010 executions into an index probe.
--
-- WHY THESE EXACT SHAPES
-- The predicate the planner must match, verbatim from order-grain-sql.ts:68 / :30
-- (identical body in both, only the activity_type vocabulary differs):
--
--     sal.organization_id = o.organization_id
--     AND sal.activity_type IN ('PACK_COMPLETED','PACK_SCAN')          -- PACK_ACTIVITY_TYPES
--                            /  ('TRACKING_SCANNED','FNSKU_SCANNED')   -- TECH_TEST_ACTIVITY_TYPES
--     AND (
--           (sal.metadata->>'order_row_id') ~ '^[0-9]+$'
--             AND (sal.metadata->>'order_row_id')::int = o.id
--       OR  (sal.metadata->>'order_id') IS NOT NULL
--             AND (sal.metadata->>'order_id') = o.order_id            -- orders.order_id is text
--     )
--
-- Three consequences drive the shapes below:
--
--   1. The comparison on the row-id arm is against `::int`, NOT text. A plain
--      text index on ((metadata->>'order_row_id')) would be DEAD for this
--      predicate — the index expression has to be the cast, exactly as written.
--   2. That cast throws on non-numeric input, so the row-id index must be
--      partial on the SAME regex guard the query carries. Because the guard sits
--      inside an OR arm rather than at the top of the WHERE, the planner proves
--      the predicate per-arm in build_paths_for_OR — which is exactly the path
--      that also builds the BitmapOr. Both indexes must therefore exist: a
--      BitmapOr is only chosen when EVERY arm has one, so shipping just one of
--      the two leaves the seq scan in place.
--   3. `activity_type` is an index COLUMN, not a partial predicate. btree serves
--      the 2-value IN list as a ScalarArrayOp index qual, so one index covers
--      both vocabularies and neither depends on the IN-list literal matching an
--      index predicate byte-for-byte.
--
-- The leading (organization_id, activity_type) prefix of both indexes already
-- serves any org+type-only probe, so a third standalone btree on those two
-- columns is deliberately omitted — it would be pure write amplification with no
-- read that prefers it.
--
-- The shipment-grain fallback arm (`shipment_id = o.shipment_id AND
-- metadata->>'order_row_id' IS NULL`) is left alone: the baseline partial index
-- idx_station_activity_logs_shipment_id already narrows it to a handful of rows
-- before the filter runs.
--
-- Plain CREATE INDEX, not CONCURRENTLY: scripts/run-pending-migrations.mjs wraps
-- every file in BEGIN/COMMIT and CONCURRENTLY cannot run inside a transaction.
-- At 31k rows / 15MB the ACCESS EXCLUSIVE window is sub-second.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_sal_org_type_order_row_id;
--   DROP INDEX IF EXISTS idx_sal_org_type_order_id;

BEGIN;

-- Guard the ::int index expression before it is built. A digit-only metadata
-- value that overflows int4 satisfies the regex, lands inside the partial
-- predicate, and would fail the index build with a bare "value out of range for
-- type integer" that names neither this table nor the offending row. Cast
-- through numeric, which is safe for any digit-only string.
DO $$
DECLARE
  overflow_rows bigint;
BEGIN
  SELECT count(*) INTO overflow_rows
    FROM station_activity_logs
   WHERE (metadata->>'order_row_id') ~ '^[0-9]+$'
     AND (metadata->>'order_row_id')::numeric > 2147483647;

  IF overflow_rows > 0 THEN
    RAISE EXCEPTION 'station_activity_logs has % row(s) whose metadata->>''order_row_id'' is all digits but overflows int4. They cannot be indexed by the ::int expression the order-grain predicate compares against, and they are already unmatchable by that predicate at runtime. Repair or null those metadata values, then re-run.', overflow_rows;
  END IF;
END $$;

-- Arm A: (metadata->>'order_row_id')::int = o.id
-- Expression matches the predicate's cast exactly; partial predicate matches the
-- regex guard the predicate carries in the same OR arm.
CREATE INDEX IF NOT EXISTS idx_sal_org_type_order_row_id
  ON station_activity_logs (
    organization_id,
    activity_type,
    ((metadata->>'order_row_id')::int)
  )
  WHERE (metadata->>'order_row_id') ~ '^[0-9]+$';

COMMENT ON INDEX idx_sal_org_type_order_row_id IS
  'Order-grain SAL membership, row-id arm. Serves the ::int cast in sqlOrderHasPackScan / sqlOrderHasTechScan (src/lib/orders/order-grain-sql.ts) as one half of a BitmapOr; the other half is idx_sal_org_type_order_id. Partial predicate mirrors the query''s own ^[0-9]+$ guard and is what keeps the cast from throwing.';

-- Arm B: (metadata->>'order_id') = o.order_id  (text = text; orders.order_id is text)
CREATE INDEX IF NOT EXISTS idx_sal_org_type_order_id
  ON station_activity_logs (
    organization_id,
    activity_type,
    ((metadata->>'order_id'))
  )
  WHERE (metadata->>'order_id') IS NOT NULL;

COMMENT ON INDEX idx_sal_org_type_order_id IS
  'Order-grain SAL membership, marketplace-order-id arm. Pairs with idx_sal_org_type_order_row_id; both must exist or the planner keeps the per-row seq scan, since a BitmapOr needs an index for every arm.';

COMMIT;
