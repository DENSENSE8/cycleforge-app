-- ============================================================================
-- 2026-09-05_seed_five_line_order.sql
--
-- WHAT
--   One marketplace order, five `orders` line rows, two outbound trackings.
--   Dogfood org only. Lets QueueGroupRow parent chrome paint on To-ship
--   without waiting for ingest (PR-2).
--
-- WHY NOW
--   Phase 0 re-keyed uniqueness to (org, order_id, account_source,
--   external_line_id). The desk still has no live five-line fold. This seed
--   is that fold: same `order_id`, five distinct `external_line_id` values,
--   `shipment_links` the desk reads, `orders.shipment_id` cache filled.
--
-- SAFETY / GATING
--   Data-only. Guarded on the org existing. Idempotent via the line unique
--   index plus STN `tracking_number_normalized`. Other tenants are untouched.
--   Trackings stay LABEL_CREATED so inWarehouse To-ship keeps them (not
--   carrier-accepted / not ship-confirm).
--
-- ROLLBACK
--   DELETE FROM orders
--    WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid
--      AND order_id = 'CF-ML-5LINE-SEED'
--      AND account_source = 'amazon';
--   DELETE FROM shipping_tracking_numbers
--    WHERE tracking_number_normalized IN ('CFML5LINESEEDTRKA', 'CFML5LINESEEDTRKB');
--
-- VERIFY
--   SELECT external_line_id, product_title, shipment_id
--     FROM orders
--    WHERE order_id = 'CF-ML-5LINE-SEED'
--    ORDER BY external_line_id;
--   -- five rows, two distinct shipment_id values.
-- ============================================================================

DO $$
DECLARE
  org uuid := '00000000-0000-0000-0000-000000000001';
  stn_a bigint;
  stn_b bigint;
  rec record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = org) THEN
    RAISE NOTICE 'skip five-line seed: org % missing', org;
    RETURN;
  END IF;

  PERFORM set_config('app.current_org', org::text, true);

  INSERT INTO shipping_tracking_numbers (
    tracking_number_raw,
    tracking_number_normalized,
    carrier,
    source_system,
    latest_status_category,
    is_label_created,
    organization_id
  ) VALUES (
    'CFML5LINESEEDTRKA',
    'CFML5LINESEEDTRKA',
    'UPS',
    'seed_five_line_order',
    'LABEL_CREATED',
    true,
    org
  )
  ON CONFLICT (tracking_number_normalized) DO UPDATE
    SET latest_status_category = 'LABEL_CREATED',
        is_label_created = true,
        organization_id = COALESCE(shipping_tracking_numbers.organization_id, EXCLUDED.organization_id),
        updated_at = now()
  RETURNING id INTO stn_a;

  INSERT INTO shipping_tracking_numbers (
    tracking_number_raw,
    tracking_number_normalized,
    carrier,
    source_system,
    latest_status_category,
    is_label_created,
    organization_id
  ) VALUES (
    'CFML5LINESEEDTRKB',
    'CFML5LINESEEDTRKB',
    'UPS',
    'seed_five_line_order',
    'LABEL_CREATED',
    true,
    org
  )
  ON CONFLICT (tracking_number_normalized) DO UPDATE
    SET latest_status_category = 'LABEL_CREATED',
        is_label_created = true,
        organization_id = COALESCE(shipping_tracking_numbers.organization_id, EXCLUDED.organization_id),
        updated_at = now()
  RETURNING id INTO stn_b;

  FOR rec IN
    SELECT * FROM (VALUES
      ('line-1'::text, 'Seed Helmet'::text, stn_a),
      ('line-2'::text, 'Seed Gloves'::text, stn_a),
      ('line-3'::text, 'Seed Jersey'::text, stn_b),
      ('line-4'::text, 'Seed Shorts'::text, stn_b),
      ('line-5'::text, 'Seed Socks'::text,  stn_b)
    ) AS lines(external_line_id, product_title, shipment_id)
  LOOP
    INSERT INTO orders (
      organization_id,
      order_id,
      external_line_id,
      account_source,
      product_title,
      sku,
      quantity,
      sale_amount,
      currency,
      fulfillment_channel,
      shipment_id,
      created_at
    ) VALUES (
      org,
      'CF-ML-5LINE-SEED',
      rec.external_line_id,
      'amazon',
      rec.product_title,
      rec.external_line_id,
      '1',
      19.00,
      'USD',
      'MFN',
      rec.shipment_id,
      now()
    )
    ON CONFLICT (organization_id, order_id, account_source, external_line_id) DO UPDATE
      SET product_title = EXCLUDED.product_title,
          shipment_id = EXCLUDED.shipment_id,
          fulfillment_channel = EXCLUDED.fulfillment_channel;
  END LOOP;

  INSERT INTO shipment_links (
    organization_id,
    owner_type,
    owner_id,
    shipment_id,
    box_seq,
    is_primary,
    direction,
    role,
    source
  )
  SELECT
    org,
    'ORDER',
    o.id,
    o.shipment_id,
    1,
    true,
    'OUTBOUND',
    'ORDER_PRIMARY',
    'seed_five_line_order'
  FROM orders o
  WHERE o.organization_id = org
    AND o.order_id = 'CF-ML-5LINE-SEED'
    AND o.account_source = 'amazon'
    AND o.shipment_id IS NOT NULL
  ON CONFLICT (organization_id, owner_type, owner_id, shipment_id) DO NOTHING;
END $$;
