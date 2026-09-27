WITH pl_latest AS (
      SELECT DISTINCT ON (pl.shipment_id)
        pl.shipment_id,
        pl.id AS packer_log_id,
        pl.created_at AS packed_at,
        pl.packed_by
      FROM packer_logs pl
      WHERE pl.shipment_id IS NOT NULL
        AND pl.completion_state = 'COMPLETED'
      ORDER BY pl.shipment_id, pl.created_at DESC NULLS LAST, pl.id DESC
    ),
    pack_activity AS (
      SELECT DISTINCT ON (sal.shipment_id)
        sal.shipment_id,
        sal.created_at,
        sal.staff_id
      FROM station_activity_logs sal
      WHERE sal.station = 'PACK'
        AND sal.shipment_id IS NOT NULL
        AND sal.activity_type IN ('PACK_COMPLETED', 'PACK_SCAN')
      ORDER BY sal.shipment_id, sal.created_at DESC NULLS LAST, sal.id DESC
    ),
    next_pack_activity AS (
      SELECT
        pa.shipment_id,
        MIN(sal.created_at) AS created_at
      FROM pack_activity pa
      JOIN station_activity_logs sal
        ON sal.shipment_id = pa.shipment_id
       AND sal.station = 'PACK'
       AND sal.activity_type IN ('PACK_COMPLETED', 'PACK_SCAN')
       AND pa.staff_id IS NOT NULL
       AND sal.staff_id = pa.staff_id
       AND pa.created_at IS NOT NULL
       AND sal.created_at > pa.created_at
      GROUP BY pa.shipment_id
    ),
    test_activity AS (
      SELECT DISTINCT ON (sal.shipment_id)
        sal.shipment_id,
        sal.created_at,
        sal.staff_id
      FROM station_activity_logs sal
      WHERE sal.station = 'TECH'
        AND sal.shipment_id IS NOT NULL
        AND sal.activity_type = 'TRACKING_SCANNED'
      ORDER BY sal.shipment_id, sal.created_at DESC NULLS LAST, sal.id DESC
    ),
    next_test_activity AS (
      SELECT
        ta.shipment_id,
        MIN(sal.created_at) AS created_at
      FROM test_activity ta
      JOIN station_activity_logs sal
        ON sal.shipment_id = ta.shipment_id
       AND sal.station = 'TECH'
       AND sal.activity_type = 'TRACKING_SCANNED'
       AND ta.staff_id IS NOT NULL
       AND sal.staff_id = ta.staff_id
       AND ta.created_at IS NOT NULL
       AND sal.created_at > ta.created_at
      GROUP BY ta.shipment_id
    ),
    pack_duration AS (
      SELECT
        pa.shipment_id,
        CASE
          WHEN MIN(sal.created_at) IS NOT NULL AND MAX(sal.created_at) > MIN(sal.created_at)
          THEN LPAD((EXTRACT(EPOCH FROM (MAX(sal.created_at) - MIN(sal.created_at)))::int / 60)::text, 2, '0')
               || ':' ||
               LPAD((EXTRACT(EPOCH FROM (MAX(sal.created_at) - MIN(sal.created_at)))::int % 60)::text, 2, '0')
          ELSE NULL
        END AS duration
      FROM pack_activity pa
      JOIN station_activity_logs sal
        ON sal.shipment_id = pa.shipment_id
       AND sal.station = 'PACK'
       AND sal.activity_type IN ('PACK_COMPLETED', 'PACK_SCAN')
       AND (pa.staff_id IS NULL OR sal.staff_id = pa.staff_id)
      GROUP BY pa.shipment_id
    ),
    test_duration AS (
      SELECT
        ta.shipment_id,
        CASE
          WHEN MIN(sal.created_at) IS NOT NULL AND MAX(sal.created_at) > MIN(sal.created_at)
          THEN LPAD((EXTRACT(EPOCH FROM (MAX(sal.created_at) - MIN(sal.created_at)))::int / 60)::text, 2, '0')
               || ':' ||
               LPAD((EXTRACT(EPOCH FROM (MAX(sal.created_at) - MIN(sal.created_at)))::int % 60)::text, 2, '0')
          ELSE NULL
        END AS duration
      FROM test_activity ta
      JOIN station_activity_logs sal
        ON sal.shipment_id = ta.shipment_id
       AND sal.station = 'TECH'
       AND sal.activity_type = 'TRACKING_SCANNED'
       AND (ta.staff_id IS NULL OR sal.staff_id = ta.staff_id)
      GROUP BY ta.shipment_id
    ),
    sal_scan AS (
      SELECT sal.shipment_id, COUNT(*)::int AS scan_count
      FROM station_activity_logs sal
      WHERE sal.shipment_id IS NOT NULL
      GROUP BY sal.shipment_id
    ),
    
    rr_ranked AS (
      SELECT
        rol.order_id,
        req.id,
        req.status,
        req.quantity_to_order,
        req.zoho_po_number,
        req.notes,
        ROW_NUMBER() OVER (
          PARTITION BY rol.order_id
          ORDER BY rol.created_at DESC, rol.id DESC
        ) AS rn
      FROM replenishment_order_lines rol
      JOIN replenishment_requests req ON req.id = rol.replenishment_request_id
    ),
    rr AS (
      SELECT
        order_id,
        id,
        status,
        quantity_to_order,
        zoho_po_number,
        notes
      FROM rr_ranked
      WHERE rn = 1
    )
    SELECT
      o.id,
      wa_deadline.deadline_at AS deadline_at,
      to_char(wa_deadline.deadline_at, 'YYYY-MM-DD') AS ship_by_date,
      o.order_date::text AS order_date,
      o.order_id,
      COALESCE(sc.product_title, o.product_title) AS product_title,
      o.item_number,
      o.quantity,
      o.shipment_id,
      stn.tracking_number_raw AS tracking_number,
      '[]'::json AS tracking_numbers,
      '[]'::json AS tracking_number_rows,
      COALESCE(sc.sku, o.sku) AS sku,
      o.condition,
      o.is_out_of_stock,
      o.oos_kind,
      o.oos_sku,
      o.oos_sku_catalog_id,
      o.oos_kit_part_id,
      o.oos_qty_short,
      o.oos_title,
      o.oos_zoho_item_id,
      (
        SELECT sil.link_status
          FROM order_line_shortages ols
          JOIN shortage_inbound_links sil
            ON sil.shortage_id = ols.id
           AND sil.organization_id = ols.organization_id
         WHERE ols.order_id = o.id
           AND ols.organization_id = o.organization_id
           AND ols.status <> 'cleared'
           AND sil.link_status <> 'released'
         ORDER BY sil.updated_at DESC
         LIMIT 1
      ) AS shortage_link_status,
      o.status,
      o.notes,
      -- Marketplace buyer note (migration 2026-07-03p): an active fulfillment
      -- exception the record paints as its NOTE badge; the pack/label routes
      -- hold on it until acknowledged (src/lib/orders/buyer-note-interlock.ts).
      o.buyer_note,
      /*
       * Row flag + ops-note count. THIRD copy of this projection, because the
       * outbound queue has three independent order readers (this route,
       * ORDER_SERIALS_CTE, and getActiveOrders) and a fact added to one does
       * not reach the others -- this is the live path the Pending grid
       * actually fetches. Scalar subqueries on o.id add nothing to GROUP BY.
       */
      (
        SELECT jsonb_build_object(
                 'flag', f.flag,
                 'by',   fs.name,
                 'at',   f.updated_at
               )
          FROM order_flags f
          LEFT JOIN staff fs ON fs.id = f.set_by_staff_id
         WHERE f.order_id = o.id
      ) AS row_flag,
      (
        SELECT COUNT(*)::int FROM order_notes n WHERE n.order_id = o.id
      ) AS note_count,
      o.is_urgent,
      o.sale_amount,
      o.currency,
      
      rr.id AS replenishment_request_id,
      rr.status AS replenishment_status,
      rr.quantity_to_order AS replenishment_quantity_to_order,
      rr.zoho_po_number AS replenishment_po_number,
      rr.notes AS replenishment_notes,
      o.customer_id,
      /* The linked buyer from the customer book (CustomerRecord DTO), so the
       * row and the evidence column read name / ship-to without a fetch per
       * row. NULL when the order has no customer_id. */
      CASE WHEN cust.id IS NULL THEN NULL ELSE jsonb_build_object('id', cust.id, 'display_name', cust.display_name, 'customer_name', cust.customer_name, 'first_name', cust.first_name, 'last_name', cust.last_name, 'email', cust.email, 'phone', cust.phone, 'mobile', cust.mobile, 'shipping_address_1', cust.shipping_address_1, 'shipping_address_2', cust.shipping_address_2, 'shipping_city', cust.shipping_city, 'shipping_state', cust.shipping_state, 'shipping_postal_code', cust.shipping_postal_code, 'shipping_country', cust.shipping_country, 'billing_address', cust.billing_address, 'created_at', cust.created_at) END AS customer,
      /* No customer-book buyer: the ship-to the paired ShipStation order
       * carries (ShipStation shipTo keys), for the evidence column's Customer
       * block. NULL when the order has a customer_id or no ShipStation ref. */
      ss_ref.ship_to AS shipstation_ship_to,
      stn.latest_status_code,
      stn.latest_status_label,
      stn.latest_status_description,
      stn.latest_status_category,
      stn.carrier,
      stn.latest_event_at::text AS latest_event_at,
      stn.has_exception,
      stn.exception_at::text AS exception_at,
      stn.is_terminal,
      COALESCE(
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
) AS is_shipped,
      to_char(timezone('America/Los_Angeles', o.created_at), 'YYYY-MM-DD HH24:MI:SS') AS created_at,
      o.tracking_added_at::text AS tracking_added_at,
      o.label_printed_at::text  AS label_printed_at,
      wa_t.assigned_tech_id   AS tester_id,
      wa_p.assigned_packer_id AS packer_id,
      pl_latest.packer_log_id,
      pl_latest.packed_at,
      COALESCE(pack_activity.staff_id, pl_latest.packed_by) AS packed_by,
      to_char(pack_activity.created_at, 'YYYY-MM-DD HH24:MI:SS') AS pack_activity_at,
      to_char(next_pack_activity.created_at, 'YYYY-MM-DD HH24:MI:SS') AS next_pack_activity_at,
      to_char(dock_stage.dock_staged_at, 'YYYY-MM-DD HH24:MI:SS') AS dock_staged_at,
      allocation_facts.storage_locations,
      allocation_facts.allocated_unit_count,
      allocation_facts.picked_unit_count,
      sku_home.location AS sku_home_location,
      pack_duration.duration AS pack_duration,
      test_activity.staff_id AS tested_by,
      to_char(test_activity.created_at, 'YYYY-MM-DD HH24:MI:SS') AS test_activity_at,
      to_char(next_test_activity.created_at, 'YYYY-MM-DD HH24:MI:SS') AS next_test_activity_at,
      test_duration.duration AS test_duration,
      COALESCE((
        SELECT STRING_AGG(tsn.serial_number, ',' ORDER BY tsn.created_at)
        FROM tech_serial_numbers tsn
        WHERE tsn.organization_id = o.organization_id
          AND tsn.serial_number IS NOT NULL
          AND BTRIM(tsn.serial_number) <> ''
          AND (
            tsn.order_id = o.id
            OR (
              tsn.order_id IS NULL
              AND o.shipment_id IS NOT NULL
              AND tsn.shipment_id = o.shipment_id
              AND NOT EXISTS (
                SELECT 1 FROM orders o2
                WHERE o2.shipment_id = o.shipment_id
                  AND o2.organization_id = o.organization_id
                  AND o2.id <> o.id
              )
            )
          )
      ), '') AS serial_number,
      staff_test_assignee.name AS tester_name,
      staff_test_assignee.name AS tested_by_name,
      staff_pack_assignee.name AS packer_name,
      staff_packed_by.name     AS packed_by_name,
      /*
       * Pick facts — THIRD copy of this projection, for the reason stated at
       * :506: this is the live path the To-ship / Pending grid fetches, and a
       * fact added only to ORDER_SERIALS_CTE never reaches it. Operator
       * 2026-09-14: the Pick column must show the picker, not the tester.
       * The laterals themselves are imported, not re-typed, so the three
       * readers cannot disagree about what a pick is.
       */
      COALESCE(pick_alloc.picked_by, pick_sess.picked_by, pick_station.picked_by) AS picked_by,
      s_picked.name AS picked_by_name,
      to_char(
        COALESCE(pick_alloc.picked_at, pick_sess.picked_at, pick_station.picked_at),
        'YYYY-MM-DD HH24:MI:SS'
      ) AS picked_at,
      /*
       * Dock scan-out. The field catalog documented this column as "dashes
       * honestly on a feed that does not stamp it yet" — this is that feed,
       * so the dash was the gap, not the truth. Operator 2026-09-14: tie the
       * routes together, so Pick · Pack · Scanned-out all read on one row.
       */
      to_char(ship_out.ship_confirmed_at, 'YYYY-MM-DD HH24:MI:SS') AS ship_confirmed_at,
      ship_out.shipped_out_by AS shipped_out_by,
      shipped_out_staff.name  AS shipped_out_by_name,
      
      prebox.unit_count       AS prebox_unit_count,
      prebox.pre_boxed_count  AS pre_boxed_count,
      prebox_staff.name       AS pre_boxed_by_name,
      to_char(prebox.pre_boxed_at, 'YYYY-MM-DD HH24:MI:SS') AS pre_boxed_at,
      staff_pick_assignee.color_hex AS tester_color_hex,
      staff_pack_assignee.color_hex AS packer_color_hex,
      (
    EXISTS (
      SELECT 1 FROM tech_serial_numbers tsn
      WHERE tsn.order_id = o.id
        AND tsn.organization_id = o.organization_id
    )
    OR EXISTS (
      SELECT 1 FROM station_activity_logs sal
      WHERE sal.organization_id = o.organization_id
        AND sal.activity_type IN ('TRACKING_SCANNED', 'FNSKU_SCANNED')
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
  ) AS has_tech_scan,
      opp.location_id AS pack_location_id,
      COALESCE(NULLIF(BTRIM(loc_pack.display_name), ''), loc_pack.name) AS pack_location_name,
      loc_pack.location_kind AS pack_location_kind,
      o.sku_catalog_id,
      COALESCE(NULLIF(BTRIM(sc.image_url), ''), ecwid_image.image_url, listing_cover.image_url) AS catalog_image_url,
      sc.category AS catalog_category,
      /* to_jsonb lets the deploy read safely while the additive column is
       * still rolling out: absent historical columns project NULL, then the
       * same expression returns the typed array once the migration lands. */
      to_jsonb(sc)->'handling_flags' AS catalog_handling_flags,
      /*
       * Price facts — the raw three, resolved in JS below into the five
       * price_* fields the desks read. They are selected UNCONDITIONALLY,
       * outside the queueShape branch above: the thin listShape=queue
       * projection is what /m/pick and the desk queues fetch, and a field
       * present only in the full shape is invisible to exactly the surfaces
       * that need it most. account_source rides along because the listing
       * arm's provenance is meaningless without the channel it is compared
       * against.
       */
      o.account_source,
      listing_price.listing_price_cents AS listing_price_cents,
      listing_price.platform           AS listing_platform,
      unit_price.listing_price_cents   AS unit_listing_price_cents
    FROM orders o
    LEFT JOIN sku_catalog sc ON sc.id = o.sku_catalog_id
    /* Marketplace-owned imagery is persisted on the Ecwid mirror. It is a
     * fallback only: a catalog image (including a Zoho-owned image) remains
     * authoritative when present. The lateral is org-scoped and single-row
     * so an unpaired Ecwid SKU can still paint its saved thumbnail without
     * duplicating the order row. */
    LEFT JOIN LATERAL (
      SELECT NULLIF(BTRIM(sp.image_url), '') AS image_url
      FROM sku_platform_ids sp
      WHERE sp.platform = 'ecwid'
        AND sp.is_active = true
        AND sp.organization_id = o.organization_id
        AND NULLIF(BTRIM(sp.image_url), '') IS NOT NULL
        AND (sp.sku_catalog_id = o.sku_catalog_id OR sp.platform_sku = o.sku)
      ORDER BY sp.created_at DESC NULLS LAST, sp.id DESC
      LIMIT 1
    ) ecwid_image ON TRUE
    /* Last tier: the SKU listing-gallery cover, where acquired Amazon/eBay
     * media lands (lib/photos/marketplace-media-backfill.ts). The paired
     * catalog row wins; an unpaired order reaches its catalog row by the
     * exact, org-scoped SKU. The fragment itself refuses to paint over a
     * catalog photo or a Zoho-owned SKU. */
    LEFT JOIN LATERAL (
      SELECT (SELECT '/api/photos/' || lp.photo_id || '/content?variant=thumb'
             FROM listing_photos lp
            WHERE lp.organization_id = sc_cover.organization_id
              AND lp.sku_catalog_id = sc_cover.id
              AND lp.is_cover
              AND NULLIF(BTRIM(sc_cover.image_url), '') IS NULL
              AND NOT EXISTS (SELECT 1 FROM items i
             WHERE i.sku = sc_cover.sku
               AND i.organization_id = sc_cover.organization_id
               AND i.status = 'active')
            LIMIT 1) AS image_url
        FROM sku_catalog sc_cover
       WHERE sc_cover.organization_id = o.organization_id
         AND (sc_cover.id = o.sku_catalog_id
              OR (o.sku_catalog_id IS NULL AND sc_cover.sku = o.sku))
       LIMIT 1
    ) listing_cover ON TRUE
    LEFT JOIN LATERAL (
      SELECT wa.deadline_at
        FROM work_assignments wa
       WHERE wa.organization_id = o.organization_id
         AND wa.entity_type = 'ORDER'
         AND wa.entity_id = o.id
         AND wa.work_type = 'TEST'
       ORDER BY CASE wa.status
                WHEN 'IN_PROGRESS' THEN 1
                WHEN 'ASSIGNED' THEN 2
                WHEN 'OPEN' THEN 3
                WHEN 'DONE' THEN 4
                ELSE 5
              END,
              wa.updated_at DESC,
              wa.id DESC
       LIMIT 1
    ) wa_deadline ON TRUE
    LEFT JOIN LATERAL (
      SELECT wa.assigned_tech_id
        FROM work_assignments wa
       WHERE wa.organization_id = o.organization_id
         AND wa.entity_type = 'ORDER'
         AND wa.entity_id = o.id
         AND wa.work_type = 'TEST'
         AND wa.assigned_tech_id IS NOT NULL
         AND wa.status <> 'CANCELED'
       ORDER BY wa.updated_at DESC, wa.id DESC
       LIMIT 1
    ) wa_t ON TRUE
    LEFT JOIN LATERAL (
      SELECT wa.assigned_packer_id
        FROM work_assignments wa
       WHERE wa.organization_id = o.organization_id
         AND wa.entity_type = 'ORDER'
         AND wa.entity_id = o.id
         AND wa.work_type = 'PACK'
         AND wa.assigned_packer_id IS NOT NULL
         AND wa.status <> 'CANCELED'
       ORDER BY wa.updated_at DESC, wa.id DESC
       LIMIT 1
    ) wa_p ON TRUE
    LEFT JOIN pl_latest ON pl_latest.shipment_id = o.shipment_id
    LEFT JOIN pack_activity ON pack_activity.shipment_id = o.shipment_id
    LEFT JOIN next_pack_activity ON next_pack_activity.shipment_id = o.shipment_id
    LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
    LEFT JOIN customers cust
      ON cust.id = o.customer_id AND cust.organization_id = o.organization_id
    LEFT JOIN LATERAL (
      SELECT ssr.ship_to
        FROM shipstation_order_refs ssr
       WHERE o.customer_id IS NULL
         AND ssr.organization_id = o.organization_id
         AND ssr.order_row_id = o.id
       ORDER BY ssr.last_seen_at DESC NULLS LAST, ssr.id DESC
       LIMIT 1
    ) ss_ref ON TRUE
    LEFT JOIN order_pack_placements opp
      ON opp.order_id = o.id AND opp.organization_id = o.organization_id
    LEFT JOIN locations loc_pack ON loc_pack.id = opp.location_id
    /*
     * Tactical Orders facts. Allocation state is the progress source; the
     * location list retains every live unit bin so a phone card never lies
     * by selecting whichever allocation happened to sort first.
     */
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (
          WHERE allocation.state NOT IN ('RELEASED', 'RETURNED')
        )::int AS allocated_unit_count,
        COUNT(*) FILTER (
          WHERE allocation.state IN ('PICKED', 'PACKED', 'SHIPPED')
        )::int AS picked_unit_count,
        COALESCE(
          jsonb_agg(DISTINCT jsonb_build_object(
            'barcode', location.barcode,
            'name', location.name,
            'room', COALESCE(location.room, room.name),
            'zoneLetter', COALESCE(location.zone_letter, room.zone_letter),
            'rowLabel', location.row_label,
            'colLabel', location.col_label
          )) FILTER (WHERE location.id IS NOT NULL),
          '[]'::jsonb
        ) AS storage_locations
      FROM order_unit_allocations allocation
      JOIN serial_units allocated_unit
        ON allocated_unit.id = allocation.serial_unit_id
       AND allocated_unit.organization_id = allocation.organization_id
      LEFT JOIN locations location
        ON location.organization_id = allocation.organization_id
       AND (
         location.id::text = allocated_unit.current_location
         OR location.name = allocated_unit.current_location
       )
      LEFT JOIN locations room
        ON room.id = location.parent_id
       AND room.organization_id = location.organization_id
      WHERE allocation.order_id = o.id
        AND allocation.organization_id = o.organization_id
        AND allocation.state NOT IN ('RELEASED', 'RETURNED')
    ) allocation_facts ON TRUE
    /*
     * The SKU's home bin (sku_stock.location) — where this SKU is picked from
     * when no unit is allocated yet. Set from the To-ship evidence column via
     * /api/update-sku-location. Same face as a storage_locations entry so one
     * formatter paints both; allocations still win on the record.
     */
    LEFT JOIN LATERAL (
      SELECT jsonb_build_object(
               'barcode', home.barcode,
               'name', COALESCE(home.name, stock.location),
               'room', COALESCE(home.room, home_room.name),
               'zoneLetter', COALESCE(home.zone_letter, home_room.zone_letter),
               'rowLabel', home.row_label,
               'colLabel', home.col_label
             ) AS location
        FROM sku_stock stock
        LEFT JOIN locations home
          ON home.organization_id = stock.organization_id
         AND (home.barcode = stock.location OR home.name = stock.location)
        LEFT JOIN locations home_room
          ON home_room.id = home.parent_id
         AND home_room.organization_id = home.organization_id
       WHERE stock.organization_id = o.organization_id
         /* CASE, not COALESCE: CoalesceExpr is never leakproof, so under
          * forced RLS the COALESCE form could not be an index condition and
          * scanned every sku_stock row of the org per order (3.3 s vs 17 ms). */
         AND stock.sku = CASE WHEN sc.sku IS NOT NULL THEN sc.sku ELSE o.sku END
         AND NULLIF(btrim(stock.location), '') IS NOT NULL
       LIMIT 1
    ) sku_home ON TRUE
    
  LEFT JOIN LATERAL (
    SELECT ie.actor_staff_id AS picked_by,
           ie.occurred_at    AS picked_at
    FROM order_unit_allocations oua
    JOIN inventory_events ie
      ON ie.serial_unit_id  = oua.serial_unit_id
     AND ie.organization_id = oua.organization_id
     AND ie.event_type IN ('PICKED', 'FORCE_PICK')
     AND ie.occurred_at    >= oua.allocated_at
    WHERE oua.order_id        = o.id
      AND oua.organization_id = o.organization_id
      AND oua.state IN ('PICKED', 'PACKED', 'SHIPPED', 'RETURNED')
    ORDER BY ie.occurred_at DESC NULLS LAST, ie.id DESC
    LIMIT 1
  ) pick_alloc ON true
  LEFT JOIN LATERAL (
    SELECT ps.picker_staff_id                   AS picked_by,
           COALESCE(ps.ended_at, ps.started_at) AS picked_at
    FROM picking_sessions ps
    WHERE ps.order_id        = o.id
      AND ps.organization_id = o.organization_id
      AND NOT ps.abandoned
    ORDER BY COALESCE(ps.ended_at, ps.started_at) DESC, ps.id DESC
    LIMIT 1
  ) pick_sess ON true
  /*
   * Third arm — the PICKER DESK's own scan. Operator 2026-09-14, after the
   * first pass blanked this column: for this org "Picker" is not `/m/pick`,
   * it is `/test?ship=urgent` (SIDEBAR_PAGE_NAV `ready-to-pack` →
   * label 'Picker'). Measured that day: 49 TECH/TRACKING_SCANNED rows, 0
   * allocation picks, 0 picking_sessions. Reading only the two arms above
   * therefore showed an empty Pick cell for the one pick workflow in use.
   *
   * It keys on the SHIPMENT, not the order, because that is what the scan
   * carries — the same key `packer_logs` uses, which is what finally puts
   * Pick and Pack on one axis.
   *
   * TRACKING_SCANNED only: the QC verdict activities on the same station
   * (SERIAL_ADDED / WS_ORDER_TESTED, and `tech_serial_numbers.tested_by`)
   * are a DIFFERENT verb, and letting them in here is exactly the borrowed
   * tester data this projection replaced.
   */
  LEFT JOIN LATERAL (
    SELECT sal.staff_id  AS picked_by,
           sal.created_at AS picked_at
    FROM station_activity_logs sal
    WHERE sal.shipment_id     = o.shipment_id
      AND sal.organization_id = o.organization_id
      AND sal.station         = 'TECH'
      AND sal.activity_type   = 'TRACKING_SCANNED'
    ORDER BY sal.created_at DESC, sal.id DESC
    LIMIT 1
  ) pick_station ON o.shipment_id IS NOT NULL
  LEFT JOIN staff s_picked
    ON s_picked.id = COALESCE(pick_alloc.picked_by, pick_sess.picked_by, pick_station.picked_by)
    
    LEFT JOIN LATERAL (
      SELECT
        MAX(so.created_at) AS ship_confirmed_at,
        (ARRAY_AGG(so.staff_id ORDER BY so.created_at DESC))[1] AS shipped_out_by
      FROM station_activity_logs so
      WHERE so.activity_type = 'SHIP_CONFIRM'
        AND o.shipment_id IS NOT NULL
        AND so.shipment_id = o.shipment_id
        AND so.organization_id = o.organization_id
    ) ship_out ON true
    LEFT JOIN staff shipped_out_staff ON shipped_out_staff.id = ship_out.shipped_out_by
    
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int  AS unit_count,
        COUNT(lm.id)::int AS pre_boxed_count,
        (ARRAY_AGG(lm.created_by ORDER BY lm.sealed_at DESC, lm.id DESC)
          FILTER (WHERE lm.id IS NOT NULL))[1] AS pre_boxed_by,
        MAX(lm.sealed_at) AS pre_boxed_at
      FROM order_unit_allocations prebox_oua
      LEFT JOIN label_manifest_items lmi
        ON lmi.organization_id = prebox_oua.organization_id
       AND lmi.serial_unit_id  = prebox_oua.serial_unit_id
      LEFT JOIN label_manifests lm
        ON lm.id              = lmi.manifest_id
       AND lm.organization_id = lmi.organization_id
       AND lm.manifest_type   = 'PREBOX'
       AND lm.status          = 'SEALED'
      WHERE prebox_oua.order_id        = o.id
        AND prebox_oua.organization_id = o.organization_id
        AND prebox_oua.state NOT IN ('RELEASED', 'RETURNED')
    ) prebox ON true
    LEFT JOIN staff prebox_staff ON prebox_staff.id = prebox.pre_boxed_by
    
    LEFT JOIN LATERAL (
      SELECT MAX(stage.created_at) AS dock_staged_at
      FROM station_activity_logs stage
      WHERE stage.activity_type = 'DOCK_STAGED'
        AND o.shipment_id IS NOT NULL
        AND stage.shipment_id = o.shipment_id
        AND stage.organization_id = o.organization_id
    ) dock_stage ON true
    
    LEFT JOIN LATERAL (
      SELECT p.listing_price_cents,
             p.platform
      FROM platform_listings p
      WHERE p.organization_id = o.organization_id
        AND p.listing_price_cents IS NOT NULL
        AND (
          p.sku_catalog_id = o.sku_catalog_id
          OR p.merchant_sku_normalized = UPPER(NULLIF(BTRIM(o.sku), ''))
        )
      ORDER BY
        (NULLIF(LOWER(BTRIM(o.account_source)), '') IS NOT NULL
          AND LOWER(BTRIM(p.platform)) = LOWER(BTRIM(o.account_source))) DESC,
        COALESCE(p.is_active, false) DESC,
        (p.sku_catalog_id IS NOT NULL AND p.sku_catalog_id = o.sku_catalog_id) DESC,
        p.updated_at DESC NULLS LAST,
        p.id DESC
      LIMIT 1
    ) listing_price ON TRUE
    LEFT JOIN LATERAL (
      SELECT sul.listing_price_cents
      FROM order_unit_allocations oua
      JOIN serial_unit_listings sul
        ON sul.serial_unit_id  = oua.serial_unit_id
       AND sul.organization_id = oua.organization_id
      WHERE oua.order_id        = o.id
        AND oua.organization_id = o.organization_id
        AND oua.state           = 'ALLOCATED'
        AND sul.listing_price_cents IS NOT NULL
      ORDER BY sul.listed_at DESC NULLS LAST, sul.id DESC
      LIMIT 1
    ) unit_price ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(
          json_agg(t.tracking_number_raw ORDER BY t.sort_key, t.tracking_number_raw)
            FILTER (WHERE COALESCE(t.tracking_number_raw, '') <> ''),
          '[]'::json
        ) AS tracking_numbers,
        COALESCE(
          json_agg(
            json_build_object(
              'shipment_id', t.shipment_id,
              'tracking', t.tracking_number_raw,
              'is_primary', t.is_primary
            )
            ORDER BY t.sort_key, t.tracking_number_raw
          ) FILTER (WHERE COALESCE(t.tracking_number_raw, '') <> ''),
          '[]'::json
        ) AS tracking_number_rows
      FROM (
        SELECT DISTINCT
          osl_link.shipment_id,
          stn_link.tracking_number_raw,
          COALESCE(osl_link.is_primary, false) AS is_primary,
          CASE WHEN COALESCE(osl_link.is_primary, false) THEN 0 ELSE 1 END AS sort_key
        FROM shipment_links osl_link
        LEFT JOIN shipping_tracking_numbers stn_link ON stn_link.id = osl_link.shipment_id
        WHERE osl_link.owner_type = 'ORDER' AND osl_link.owner_id = o.id

        UNION

        SELECT DISTINCT
          o_primary.shipment_id,
          stn_primary.tracking_number_raw,
          true AS is_primary,
          0 AS sort_key
        FROM orders o_primary
        LEFT JOIN shipping_tracking_numbers stn_primary ON stn_primary.id = o_primary.shipment_id
        WHERE o_primary.id = o.id

        UNION

        SELECT DISTINCT
          o_sibling.shipment_id,
          stn_sibling.tracking_number_raw,
          false AS is_primary,
          2 AS sort_key
        FROM orders o_sibling
        LEFT JOIN shipping_tracking_numbers stn_sibling ON stn_sibling.id = o_sibling.shipment_id
        WHERE o_sibling.order_id = o.order_id
      ) t
    ) order_trackings ON TRUE
    LEFT JOIN rr ON rr.order_id = o.id
    LEFT JOIN test_activity ON test_activity.shipment_id = o.shipment_id
    LEFT JOIN next_test_activity ON next_test_activity.shipment_id = o.shipment_id
    LEFT JOIN pack_duration ON pack_duration.shipment_id = o.shipment_id
    LEFT JOIN test_duration ON test_duration.shipment_id = o.shipment_id
    LEFT JOIN sal_scan ON sal_scan.shipment_id = o.shipment_id
    LEFT JOIN staff staff_test_assignee ON staff_test_assignee.id = test_activity.staff_id
    LEFT JOIN staff staff_pick_assignee ON staff_pick_assignee.id = wa_t.assigned_tech_id
    LEFT JOIN staff staff_packed_by ON staff_packed_by.id = COALESCE(pack_activity.staff_id, pl_latest.packed_by)
    LEFT JOIN staff staff_pack_assignee ON staff_pack_assignee.id = wa_p.assigned_packer_id
    WHERE 1=1
   AND o.organization_id = '00000000-0000-0000-0000-000000000001' AND (
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
    ) ORDER BY wa_deadline.deadline_at ASC NULLS LAST, o.id ASC LIMIT 201
