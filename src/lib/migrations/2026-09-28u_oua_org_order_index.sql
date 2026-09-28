-- 2026-09-28u_oua_org_order_index.sql
--
-- WHAT
--   CREATE INDEX idx_oua_org_order
--     ON order_unit_allocations (organization_id, order_id);
--
-- WHY
--   Every order-grain read of allocations is tenant-scoped by order:
--   order QC (latest verdict of an allocated unit), the picked-by scalar
--   (sqlOrderPickedByStaffId), the order record's units. They filter
--   `organization_id = $org AND order_id = …`; the only order index was
--   idx_oua_order_state (order_id, state) with no org column, so the org
--   predicate was a heap recheck and org-first plans had nothing to use.
--
-- SAFETY
--   Plain CREATE INDEX inside the runner's transaction; 53 rows on dev.
--   No code depends on it for correctness.
--
-- VERIFY
--   EXPLAIN SELECT 1 FROM order_unit_allocations
--    WHERE organization_id = '00000000-0000-0000-0000-000000000001' AND order_id = 1;
--   -- expect Index Scan / Index Only Scan using idx_oua_org_order once the
--   --  table is large enough for the planner to prefer an index.
--
-- ROLLBACK
--   DROP INDEX IF EXISTS idx_oua_org_order;

CREATE INDEX IF NOT EXISTS idx_oua_org_order
  ON order_unit_allocations (organization_id, order_id);
