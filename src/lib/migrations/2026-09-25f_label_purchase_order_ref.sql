-- 2026-09-25f_label_purchase_order_ref.sql
-- Reference-only labels: the global `+` label intake buys a return or a
-- replacement label for an order number that is NOT in the system yet. Such a
-- row has no `order_id`, so the ledger needs the number the operator typed and
-- the address the label was bought against (no order holds it).
--
--   order_ref  the typed order number; the row's identity until it is paired
--   ship_to    the customer ShipAddress (JSON) the label was rated and bought for
--
-- Pairing: when an order with that number exists, the intake sets `order_id`
-- on every unpaired row whose `order_ref` matches (keeps `order_ref`).
--
-- Safety gating: additive nullable columns and a partial index. Existing rows
-- and writers are untouched (the order-bound claim never writes these
-- columns). The table is already FORCE-RLS and every writer stamps
-- organization_id under tenantQuery.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_shipping_label_purchases_org_order_ref;
--   ALTER TABLE shipping_label_purchases DROP COLUMN IF EXISTS order_ref, DROP COLUMN IF EXISTS ship_to;
--
-- VERIFY:
--   SELECT column_name, is_nullable FROM information_schema.columns
--    WHERE table_name = 'shipping_label_purchases' AND column_name IN ('order_ref', 'ship_to');

ALTER TABLE shipping_label_purchases ADD COLUMN IF NOT EXISTS order_ref TEXT;
ALTER TABLE shipping_label_purchases ADD COLUMN IF NOT EXISTS ship_to JSONB;

CREATE INDEX IF NOT EXISTS idx_shipping_label_purchases_org_order_ref
  ON shipping_label_purchases (organization_id, order_ref)
  WHERE order_ref IS NOT NULL;
