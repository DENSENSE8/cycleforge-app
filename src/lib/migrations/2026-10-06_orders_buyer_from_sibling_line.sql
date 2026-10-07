-- 2026-10-06_orders_buyer_from_sibling_line.sql
-- Buyer backfill from what the database already holds (Phase 1 slice 2).
--
-- What: an order line with no customer takes the customer another line of the
-- SAME order (organization_id, order_id) is linked to — tier 2 of the one buyer
-- resolver (resolveOrderBuyers, src/lib/orders/resolve-buyer-customers.ts),
-- applied to existing rows. Measured before apply (dev, org …01): 1 line.
-- The other evidence sources were measured and hold nothing more to fill:
-- shipstation_order_refs (every linked row already has a buyer),
-- customers.order_id (0), label_ingestions.detected_ship_to_name (0),
-- shipping_tracking_numbers.metadata (no ship-to). The remaining gap is filled
-- by the ShipStation 6-month backfill (slice 7) through the same resolver.
--
-- Safety gating: data-only, within one org's rows; idempotent (only NULLs).
-- ROLLBACK: none needed — fills NULLs with the order's own buyer.

UPDATE orders o
   SET customer_id = (
         SELECT t.customer_id
           FROM orders t
          WHERE t.organization_id = o.organization_id
            AND t.order_id = o.order_id
            AND t.customer_id IS NOT NULL
          ORDER BY t.created_at DESC, t.id DESC
          LIMIT 1)
 WHERE o.customer_id IS NULL
   AND NULLIF(btrim(o.order_id), '') IS NOT NULL
   AND EXISTS (
         SELECT 1 FROM orders t
          WHERE t.organization_id = o.organization_id
            AND t.order_id = o.order_id
            AND t.customer_id IS NOT NULL);
