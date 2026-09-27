WITH to_ship AS (
    SELECT
      COUNT(*)::int AS triage,
      COUNT(*) FILTER (WHERE (NOT (
    EXISTS (
      SELECT 1 FROM station_activity_logs sal
      WHERE sal.organization_id = o.organization_id
        AND sal.activity_type IN ('PACK_COMPLETED', 'PACK_SCAN')
        AND (
          sal.order_row_id = o.id
          OR sal.ext_order_id = o.order_id
          OR (
            sal.shipment_id IS NOT NULL
            AND sal.shipment_id = o.shipment_id
            AND (sal.metadata->>'order_row_id') IS NULL
            AND (
  o.shipment_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM orders o2
    WHERE o2.shipment_id = o.shipment_id
      AND o2.organization_id = o.organization_id
      AND o2.id <> o.id
  )
)
          )
        )
    )
  ) AND NOT EXISTS (
      SELECT 1
        FROM order_unit_allocations pick_alloc_q
        JOIN serial_units pick_unit_q
          ON pick_unit_q.id = pick_alloc_q.serial_unit_id
         AND pick_unit_q.organization_id = pick_alloc_q.organization_id
       WHERE pick_alloc_q.order_id = o.id
         AND pick_alloc_q.organization_id = o.organization_id
         AND pick_alloc_q.state NOT IN ('RELEASED', 'RETURNED')
      HAVING COUNT(*) > 0
         AND COUNT(*) FILTER (
               WHERE pick_alloc_q.state NOT IN ('PICKED', 'PACKED', 'SHIPPED')
             ) = 0
    )))::int AS pick
    FROM orders o
    LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
    WHERE o.organization_id = '00000000-0000-0000-0000-000000000001'
      AND (
      NOT COALESCE(
  stn.is_carrier_accepted
  OR stn.is_in_transit
  OR stn.is_out_for_delivery
  OR stn.is_delivered
  OR (
    COALESCE(BTRIM(stn.latest_status_category), '') <> ''
    AND UPPER(BTRIM(stn.latest_status_category)) NOT IN ('LABEL_CREATED', 'UNKNOWN')
  )
  OR UPPER(COALESCE(stn.latest_status_label, '')) LIKE '%MOVING THROUGH NETWORK%'
  OR UPPER(COALESCE(stn.latest_status_description, '')) LIKE '%MOVING THROUGH NETWORK%',
  false
)
      AND NOT EXISTS (
      SELECT 1 FROM station_activity_logs sal_out
      WHERE sal_out.shipment_id IS NOT NULL
        AND sal_out.shipment_id = o.shipment_id
        AND sal_out.organization_id = o.organization_id
        AND sal_out.activity_type = 'SHIP_CONFIRM'
    )
      AND COALESCE(o.fulfillment_channel, '') <> 'AFN'
      AND o.shipment_id IS NOT NULL
      AND COALESCE(TRIM(stn.tracking_number_raw), '') <> ''
    )
  )
  SELECT
    t.triage,
    t.pick,
    (
      SELECT COUNT(*)::int
      FROM orders o
      WHERE o.organization_id = '00000000-0000-0000-0000-000000000001'
        AND ((
      o.is_out_of_stock = true
      AND NOT EXISTS (
      SELECT 1 FROM station_activity_logs sal_out
      WHERE sal_out.shipment_id IS NOT NULL
        AND sal_out.shipment_id = o.shipment_id
        AND sal_out.organization_id = o.organization_id
        AND sal_out.activity_type = 'SHIP_CONFIRM'
    )
      AND COALESCE(o.fulfillment_channel, '') <> 'AFN'
    ) AND EXISTS (
      SELECT 1
        FROM order_line_shortages ols
        JOIN shortage_inbound_links sil
          ON sil.shortage_id = ols.id
         AND sil.organization_id = ols.organization_id
       WHERE ols.order_id = o.id
         AND ols.organization_id = o.organization_id
         AND ols.status <> 'cleared'
         AND sil.link_status <> 'released'
         AND sil.source_kind IN ('po_line', 'receiving_line')
    ))
    ) AS po,
    (
      WITH shipped_day AS MATERIALIZED (
        SELECT (date_trunc('day', NOW() AT TIME ZONE z.name) AT TIME ZONE z.name) AS lo,
               ((date_trunc('day', NOW() AT TIME ZONE z.name) + INTERVAL '1 day') AT TIME ZONE z.name) AS hi
          FROM (
            SELECT COALESCE((
              SELECT tzn.name
                FROM organizations org
                JOIN pg_timezone_names tzn ON tzn.name = org.settings->>'timezone'
               WHERE org.id = '00000000-0000-0000-0000-000000000001'
               LIMIT 1
            ), 'UTC') AS name
            OFFSET 0
          ) z
      )
      SELECT COUNT(*)::int
        FROM shipped_day d
        JOIN station_activity_logs sal
          ON sal.created_at >= d.lo
         AND sal.created_at < d.hi
       WHERE sal.organization_id = '00000000-0000-0000-0000-000000000001'
         AND sal.station = 'PACK'
    ) AS shipped_today
  FROM to_ship t
