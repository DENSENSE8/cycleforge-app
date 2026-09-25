-- 2026-09-24i_shipstation_ref_amounts.sql
-- The money + line detail ShipStation reports for an order and a label, kept on
-- the provider refs (2026-09-24h) so the order price panel reads the ledger
-- instead of calling ShipStation live:
--
--   shipstation_order_refs.order_total / amount_paid / tax_amount /
--     shipping_amount   v1 order `orderTotal`, `amountPaid`, `taxAmount`,
--                       `shippingAmount` (null when absent)
--   shipstation_order_refs.line_items
--                       every v1 item line: [{sku, name, quantity, unitPrice,
--                       lineItemKey, orderItemId, upc, imageUrl, options, adjustment}]
--   shipstation_shipment_refs.shipment_cost / insurance_cost
--                       v1 shipment `shipmentCost`, `insuranceCost`
--
-- Refreshed on every sighting (the connector upserts ON CONFLICT DO UPDATE).
-- Safety: additive nullable columns on tables whose only writer is the
-- ShipStation connector.
-- ROLLBACK: ALTER TABLE … DROP COLUMN IF EXISTS for each column below.

ALTER TABLE shipstation_order_refs ADD COLUMN IF NOT EXISTS order_total     NUMERIC(12, 2);
ALTER TABLE shipstation_order_refs ADD COLUMN IF NOT EXISTS amount_paid     NUMERIC(12, 2);
ALTER TABLE shipstation_order_refs ADD COLUMN IF NOT EXISTS tax_amount      NUMERIC(12, 2);
ALTER TABLE shipstation_order_refs ADD COLUMN IF NOT EXISTS shipping_amount NUMERIC(12, 2);
ALTER TABLE shipstation_order_refs ADD COLUMN IF NOT EXISTS line_items      JSONB;

-- The rest of the order as ShipStation holds it — the durable "full details"
-- record behind the operator-facing `orders` row (which keeps one row per
-- order): dates, buyer identity + both addresses, notes, gift, the requested
-- and chosen service, and the parcel.
ALTER TABLE shipstation_order_refs ADD COLUMN IF NOT EXISTS order_date         TEXT;
ALTER TABLE shipstation_order_refs ADD COLUMN IF NOT EXISTS payment_date       TEXT;
ALTER TABLE shipstation_order_refs ADD COLUMN IF NOT EXISTS ship_by_date       TEXT;
ALTER TABLE shipstation_order_refs ADD COLUMN IF NOT EXISTS ship_date          TEXT;
ALTER TABLE shipstation_order_refs ADD COLUMN IF NOT EXISTS customer_username  TEXT;
ALTER TABLE shipstation_order_refs ADD COLUMN IF NOT EXISTS customer_email     TEXT;
ALTER TABLE shipstation_order_refs ADD COLUMN IF NOT EXISTS ship_to            JSONB;
ALTER TABLE shipstation_order_refs ADD COLUMN IF NOT EXISTS bill_to            JSONB;
ALTER TABLE shipstation_order_refs ADD COLUMN IF NOT EXISTS customer_notes     TEXT;
ALTER TABLE shipstation_order_refs ADD COLUMN IF NOT EXISTS internal_notes     TEXT;
ALTER TABLE shipstation_order_refs ADD COLUMN IF NOT EXISTS gift               BOOLEAN;
ALTER TABLE shipstation_order_refs ADD COLUMN IF NOT EXISTS gift_message       TEXT;
ALTER TABLE shipstation_order_refs ADD COLUMN IF NOT EXISTS requested_service  TEXT;
ALTER TABLE shipstation_order_refs ADD COLUMN IF NOT EXISTS carrier_code       TEXT;
ALTER TABLE shipstation_order_refs ADD COLUMN IF NOT EXISTS service_code       TEXT;
ALTER TABLE shipstation_order_refs ADD COLUMN IF NOT EXISTS weight_oz          NUMERIC(10, 2);
ALTER TABLE shipstation_order_refs ADD COLUMN IF NOT EXISTS dimensions         JSONB;

ALTER TABLE shipstation_shipment_refs ADD COLUMN IF NOT EXISTS shipment_cost  NUMERIC(12, 2);
ALTER TABLE shipstation_shipment_refs ADD COLUMN IF NOT EXISTS insurance_cost NUMERIC(12, 2);
