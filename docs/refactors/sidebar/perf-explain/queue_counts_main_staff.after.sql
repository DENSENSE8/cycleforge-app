WITH scope AS MATERIALIZED (
      SELECT
        o.id,
        o.organization_id,
        o.sku_catalog_id,
        o.docs_not_required,
        o.is_out_of_stock,
        o.is_urgent,
        (
    EXISTS (
      SELECT 1 FROM tech_serial_numbers tsn
      WHERE tsn.order_id = o.id
        AND tsn.organization_id = o.organization_id
    )
    OR EXISTS (
      SELECT 1 FROM station_activity_logs sal
      WHERE sal.organization_id = o.organization_id
        AND sal.activity_type IN ('PICK_SCANNED', 'FNSKU_SCANNED')
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
  ) AS has_pick_scan,
        (
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
  ) AS has_pack_scan,
        (
      SELECT wa_dl.deadline_at
        FROM work_assignments wa_dl
       WHERE wa_dl.organization_id = o.organization_id
         AND wa_dl.entity_type = 'ORDER'
         AND wa_dl.entity_id = o.id
         AND wa_dl.work_type = 'TEST'
       ORDER BY CASE wa_dl.status
                WHEN 'IN_PROGRESS' THEN 1
                WHEN 'ASSIGNED' THEN 2
                WHEN 'OPEN' THEN 3
                WHEN 'DONE' THEN 4
                ELSE 5
              END,
              wa_dl.updated_at DESC,
              wa_dl.id DESC
       LIMIT 1
    ) AS deadline_at
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
        AND EXISTS (
      SELECT 1 FROM work_assignments wa
      WHERE wa.organization_id = o.organization_id
        AND wa.entity_type = 'ORDER' AND wa.entity_id = o.id
        AND wa.status <> 'CANCELED'
        AND (wa.assigned_packer_id = 4 OR wa.assigned_tech_id = 4)
    )
    ),
    groups AS (
      SELECT
        s.has_pick_scan,
        s.has_pack_scan,
        s.is_out_of_stock AS blocked,
        COUNT(*)::int AS n,
        COUNT(*) FILTER (WHERE s.is_urgent)::int AS urgent_n,
        COUNT(*) FILTER (
          WHERE CASE
        WHEN s.deadline_at IS NULL THEN 'unscheduled'
        WHEN timezone('America/Los_Angeles', s.deadline_at)::date < timezone('America/Los_Angeles', NOW())::date THEN 'overdue'
        WHEN timezone('America/Los_Angeles', s.deadline_at)::date = timezone('America/Los_Angeles', NOW())::date THEN 'today'
        ELSE 'upcoming'
      END IN ('overdue', 'today')
        )::int AS must_ship_n
      FROM scope s
      GROUP BY 1, 2, 3
    )
    SELECT
      COALESCE((SELECT json_agg(g) FROM groups g), '[]'::json) AS groups,
      (SELECT COUNT(*)::int FROM scope o WHERE (
  NOT (
  EXISTS (
    SELECT 1
      FROM document_entity_links l
      JOIN documents d
        ON d.id = l.document_id
       AND d.organization_id = l.organization_id
     WHERE l.organization_id = o.organization_id
       AND l.entity_type = 'ORDER'
       AND l.entity_id = o.id
       AND d.document_type = 'shipping_label'
  )
  OR EXISTS (
    SELECT 1
      FROM documents d
     WHERE d.organization_id = o.organization_id
       AND d.entity_type = 'SHIPPING_LABEL'
       AND d.entity_id = o.id
  )
)
  OR (
    COALESCE(o.docs_not_required, false) = false
    AND NOT EXISTS (
  SELECT 1
    FROM document_entity_links l
    JOIN documents d
      ON d.id = l.document_id
     AND d.organization_id = l.organization_id
   WHERE l.organization_id = o.organization_id
     AND (
       (l.entity_type = 'ORDER' AND l.entity_id = o.id)
       OR (o.sku_catalog_id IS NOT NULL
           AND l.entity_type = 'SKU'
           AND l.entity_id = o.sku_catalog_id)
     )
     AND COALESCE(d.document_type, '') <> 'shipping_label'
)
  )
)) AS paperwork_incomplete,
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
         AND sal.staff_id = 4
    ) AS shipped_today
