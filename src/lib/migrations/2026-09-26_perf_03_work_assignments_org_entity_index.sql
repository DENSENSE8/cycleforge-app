-- 2026-09-26_perf_03_work_assignments_org_entity_index.sql
--
-- WHAT
--   idx_wa_org_entity ON work_assignments (organization_id, entity_id)
--
-- WHY
--   Every per-order assignment probe — /api/orders' ship-by / tester / packer
--   laterals, the `?staff=` EXISTS (sqlOrderAssignedToStaff) and the ship-by
--   subquery (sqlOrderTestDeadlineAt) in src/lib/orders/desk-view-sql.ts —
--   now filters `wa.organization_id = o.organization_id AND wa.entity_id = o.id`.
--   Under FORCE RLS as app_tenant only leakproof operators can be index
--   conditions: uuid_eq and int4eq are, the enum `=` on entity_type /
--   work_type / status is not. The existing idx_work_assignments_entity leads
--   with the enum entity_type, so under RLS it degraded to a non-leading
--   `entity_id` condition that walked the whole index per order:
--     W1 deadline lateral over 4,974 orders: 912.6 ms, cost 435 per probe
--     (phase0-findings §2.2); /api/orders whole-table ROW_NUMBER() CTEs
--     misestimated 252 vs ~5k rows and nested-looped 22.7M rows
--     (docs/refactors/sidebar/perf-explain/orders_list_in_warehouse_queue.before.txt, 6,922 ms).
--   Keyed on the two leakproof columns only: putting the enum entity_type
--   between them would stop the index condition at organization_id again.
--   The enum quals stay as filters over the handful of rows one
--   (organization_id, entity_id) holds.
--
--   Considered and NOT done: converting entity_type / work_type / status from
--   enums to text + CHECK (the audit's rank-2 option). With the probes above
--   org-led and the whole-table window CTEs gone, the remaining benefit is row
--   estimates for enum filters, while the conversion rewrites the table, must
--   rebuild every partial index whose predicate names enum literals, changes
--   ORDER BY status from declaration order to alphabetical for any reader that
--   sorts on it, and breaks every `'X'::work_entity_type_enum` comparison and
--   fn_cancel_work_assignments_on_entity_delete (TG_ARGV[0]::work_entity_type_enum
--   against a text column has no operator). Not worth that blast radius now.
--
-- SAFETY
--   Plain CREATE INDEX (the runner wraps the file in a transaction), ~9.2k rows
--   / 6 MB: sub-second SHARE lock (writes wait, reads continue). No code
--   depends on the index existing; queries are correct without it.
--
-- VERIFY
--   scripts/perf-explain-after.sh -> orders_list_in_warehouse_queue.after.txt and
--   queue_counts_main_staff.after.txt show
--   `Index Cond: ((organization_id = o.organization_id) AND (entity_id = o.id))`.
--
-- ROLLBACK
--   DROP INDEX IF EXISTS idx_wa_org_entity;

CREATE INDEX IF NOT EXISTS idx_wa_org_entity
  ON work_assignments (organization_id, entity_id);

COMMENT ON INDEX idx_wa_org_entity IS
  'Per-entity assignment probe keyed on leakproof columns only, so it is an index condition under RLS (src/lib/orders/orders-list.ts laterals, sqlOrderAssignedToStaff, sqlOrderTestDeadlineAt).';
