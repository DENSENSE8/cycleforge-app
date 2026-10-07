-- 2026-10-07_a_orders_sale_amount_shipstation_unknown_zero.sql
-- Records Phase 3 §3.4.4: an order line ShipStation never priced reads "no
-- price", not $0.00.
--
-- Why: ShipStation reports orderTotal 0 for an order it holds no price for (a
-- manual order with no priced item). The connector's rule — a 0 with no priced
-- item is unknown, not a free sale (knownShipStationTotal,
-- src/lib/orders/order-total.ts, used by toCanonicalLine in
-- src/lib/integrations/connectors/shipstation-orders.ts) — shipped in 9fd01cbba
-- (2026-09-25 00:15 UTC); the rows below were written 2026-09-24 (21 manual
-- rows at 21:22 UTC) while that importer was being built, with sale_amount =
-- 0.00. sale_amount is first-write-wins (resolveSaleAmountWrite), so the stale
-- 0.00 never heals, and every price reader (Records order total, customer spend,
-- the order's price panel) paints $0.00. No operator price edit touched these
-- rows (audit_logs: none).
--
-- What: NULL the 0.00 sale_amount of a row whose linked ShipStation order (its
-- latest shipstation_order_refs row) totals 0 with no priced, non-adjustment item.
-- unit_price is left as is.
--
-- Before (read-only, 2026-10-07, primary): 25 rows (21 manual, 2 mekong,
-- 1 dragon, 1 ecwid; org …01; created 2026-08-26 … 2026-09-24)
--   WITH ref AS (
--     SELECT DISTINCT ON (r.order_row_id) r.order_row_id, r.organization_id, r.order_total,
--            EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(r.line_items, '[]'::jsonb)) it
--                     WHERE NOT COALESCE((it->>'adjustment')::boolean, false)
--                       AND (it->>'unitPrice')::numeric > 0) AS priced
--       FROM shipstation_order_refs r
--      WHERE r.order_row_id IS NOT NULL
--      ORDER BY r.order_row_id, r.last_seen_at DESC NULLS LAST, r.id DESC)
--   SELECT count(*) FROM orders o
--     JOIN ref ON ref.order_row_id = o.id AND ref.organization_id = o.organization_id
--    WHERE o.sale_amount = 0 AND ref.order_total = 0 AND NOT ref.priced;
-- Verify: the same count → 0.
--
-- Safety gating: data-only UPDATE within each row's own tenant; idempotent
-- (only rows still at 0.00). A later priced ShipStation sync fills the NULL
-- through the same first-write-wins writer.
-- ROLLBACK: none needed — 0.00 was ShipStation's "unknown", not a price.

WITH ref AS (
  SELECT DISTINCT ON (r.order_row_id) r.order_row_id, r.organization_id, r.order_total,
         EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(r.line_items, '[]'::jsonb)) it
                  WHERE NOT COALESCE((it->>'adjustment')::boolean, false)
                    AND (it->>'unitPrice')::numeric > 0) AS priced
    FROM shipstation_order_refs r
   WHERE r.order_row_id IS NOT NULL
   ORDER BY r.order_row_id, r.last_seen_at DESC NULLS LAST, r.id DESC
)
UPDATE orders o
   SET sale_amount = NULL
  FROM ref
 WHERE ref.order_row_id = o.id
   AND ref.organization_id = o.organization_id
   AND o.sale_amount = 0
   AND ref.order_total = 0
   AND NOT ref.priced;
