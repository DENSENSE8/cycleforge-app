-- Canonical inbound PICKUP orders project into the existing Local Pickup read
-- model so Receiving history and Sales receipt history read the same landed
-- record. The inbound order remains the write identity and idempotency root.

BEGIN;

ALTER TABLE local_pickup_orders
  ADD COLUMN IF NOT EXISTS inbound_order_id BIGINT REFERENCES inbound_order(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS paid_amount_cents BIGINT CHECK (paid_amount_cents IS NULL OR paid_amount_cents >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS ux_local_pickup_orders_inbound_order
  ON local_pickup_orders (organization_id, inbound_order_id)
  WHERE inbound_order_id IS NOT NULL;

ALTER TABLE local_pickup_order_items
  ADD COLUMN IF NOT EXISTS inbound_line_key TEXT,
  ALTER COLUMN condition_grade DROP NOT NULL,
  ALTER COLUMN condition_grade DROP DEFAULT,
  ALTER COLUMN parts_status DROP NOT NULL,
  ALTER COLUMN parts_status DROP DEFAULT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_local_pickup_order_items_inbound_line
  ON local_pickup_order_items (organization_id, order_id, inbound_line_key)
  WHERE inbound_line_key IS NOT NULL;

COMMENT ON COLUMN local_pickup_orders.inbound_order_id IS
  'Canonical inbound-order identity for pickup paperwork landed through ingestInboundOrder.';
COMMENT ON COLUMN local_pickup_orders.payment_method IS
  'Payment method transcribed from the local-pickup money receipt.';
COMMENT ON COLUMN local_pickup_orders.paid_amount_cents IS
  'Amount paid in integer cents, transcribed from the local-pickup money receipt.';
COMMENT ON COLUMN local_pickup_order_items.inbound_line_key IS
  'Stable line identity within the canonical inbound pickup order.';

COMMIT;
