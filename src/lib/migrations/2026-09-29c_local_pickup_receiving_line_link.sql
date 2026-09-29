-- A pickup item needs a direct, indexed route to its canonical receiving line.
-- The prior `(order.inbound_order_id, item.inbound_line_key)` path was
-- correct but forced every display read to rediscover the relationship.

BEGIN;

ALTER TABLE local_pickup_order_items
  ADD COLUMN IF NOT EXISTS receiving_line_id INTEGER
    REFERENCES receiving_line(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_local_pickup_items_org_receiving_line
  ON local_pickup_order_items (organization_id, receiving_line_id)
  WHERE receiving_line_id IS NOT NULL;

-- Canonically imported pickups have an exact order + line identity.
UPDATE local_pickup_order_items i
   SET receiving_line_id = rl.id,
       updated_at = NOW()
  FROM local_pickup_orders o,
       receiving_line rl
 WHERE i.receiving_line_id IS NULL
   AND o.id = i.order_id
   AND o.organization_id = i.organization_id
   AND o.inbound_order_id IS NOT NULL
   AND i.inbound_line_key IS NOT NULL
   AND rl.organization_id = i.organization_id
   AND rl.inbound_order_id = o.inbound_order_id
   AND rl.line_key = i.inbound_line_key;

-- Legacy rows can be linked only when carton + SKU identifies exactly one
-- receiving line. Ambiguous rows stay NULL instead of guessing.
WITH candidates AS (
  SELECT i.id AS item_id, MIN(rl.id) AS receiving_line_id
    FROM local_pickup_order_items i
    JOIN local_pickup_orders o
      ON o.id = i.order_id AND o.organization_id = i.organization_id
    JOIN receiving_line rl
      ON rl.organization_id = i.organization_id
     AND rl.receiving_id = COALESCE(i.receiving_id, o.receiving_id)
     AND lower(btrim(COALESCE(rl.sku, ''))) = lower(btrim(COALESCE(i.sku, '')))
   WHERE i.receiving_line_id IS NULL
     AND COALESCE(i.receiving_id, o.receiving_id) IS NOT NULL
     AND btrim(COALESCE(i.sku, '')) <> ''
   GROUP BY i.id
  HAVING COUNT(*) = 1
)
UPDATE local_pickup_order_items i
   SET receiving_line_id = c.receiving_line_id,
       updated_at = NOW()
  FROM candidates c
 WHERE i.id = c.item_id;

COMMENT ON COLUMN local_pickup_order_items.receiving_line_id IS
  'Direct read-model link to the canonical receiving line; authored by ingestInboundOrder and backfilled only from unambiguous identity.';

COMMIT;
