SELECT COUNT(*)::int AS n
      FROM orders o
      LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
      WHERE o.organization_id = '00000000-0000-0000-0000-000000000001'
        AND NOT COALESCE(
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
        AND COALESCE(o.fulfillment_channel, '') <> 'AFN'
        AND NOT EXISTS (
      SELECT 1 FROM station_activity_logs sal_out
      WHERE sal_out.shipment_id IS NOT NULL
        AND sal_out.shipment_id = o.shipment_id
        AND sal_out.organization_id = o.organization_id
        AND sal_out.activity_type = 'SHIP_CONFIRM'
    )
        AND (
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
)
