/**
 * `GET /api/orders` list read — the SQL for one parsed query, executed under
 * the tenant GUC, price-projected, and cached. The route and the RSC seeds
 * (`unshipped-queue-seed.server.ts`) both call {@link listOrders}, so first
 * paint runs the same query in-process instead of an HTTP self-fetch.
 */
import 'server-only';
import pool from '@/lib/db';
import { tenantQueryOneTrip } from '@/lib/tenancy/db';
import { getCachedJson, setCachedJson } from '@/lib/cache/upstash-cache';
import {
  ordersSearchLast8,
  ordersSearchLikePattern,
  ordersSearchNeedle,
  ordersSearchTrackingKey18,
} from '@/lib/orders/orders-search';
import { SHIPPED_BY_CARRIER_SQL } from '@/lib/sql-fragments';
import { PICKUP_FULFILLMENT_CHANNEL } from '@/lib/orders/release-gates';
import { listingCoverThumbUrlSql } from '@/lib/photos/listing-photos';
import { customerDisplayJsonSql } from '@/lib/customers/customer-display';
import {
  DOCK_STAGING_LATERAL,
  PREBOX_FACTS_LATERAL,
  PREBOX_FACTS_SELECT,
  PRICE_FACTS_LATERALS,
  SHIP_OUT_LATERAL,
} from '@/lib/neon/orders-queries';
import { resolveLinePrice } from '@/lib/orders/price-resolve';
import { PACK_ACTIVITY_TYPES, sqlInList } from '@/lib/station-activity';
import { URGENT_SERVICE_LEVELS } from '@/lib/shipping/service-level';
import { sqlOrderHasShipConfirm } from '@/lib/orders/order-grain-sql';
import { ORDER_STAGE_FACTS_JOIN, ORDER_STAGE_FACTS_SIGNALS } from '@/lib/orders/order-stage-facts';
import { WAREHOUSE_TIME_ZONE } from '@/utils/date';
import {
  WA_TEST_DEADLINE_RANK_ORDER_SQL,
  sqlDeskRefinementClauses,
  sqlOrderAssignedToStaff,
  sqlOrderBlockedPending,
  sqlOrderDeskStage,
  sqlOrderHasPoPairedShortage,
  sqlOrderInWarehouseToShip,
  sqlOrderOpenUnshipped,
} from '@/lib/orders/desk-view-sql';
import {
  encodeOrdersListCursor,
  ordersListCacheLookupKey,
  type OrdersListQuery,
} from '@/lib/orders/orders-list-query';

let replenishmentSchemaCheck:
  | { value: boolean; checkedAt: number }
  | null = null;

export function isDatabaseUnavailable(error: unknown) {
  if (!(error instanceof Error)) return false;
  const causeMessage = typeof (error as { cause?: unknown }).cause === 'object'
    ? String(((error as { cause?: { message?: string } }).cause?.message) || '')
    : '';
  const message = `${error.message} ${causeMessage}`;
  return /ENOTFOUND|ECONNREFUSED|connect_timeout|connection terminated|timeout/i.test(message);
}

let shortageSchemaCheck: { value: boolean; checkedAt: number } | null = null;

async function hasShortageSchema(): Promise<boolean> {
  if (shortageSchemaCheck && Date.now() - shortageSchemaCheck.checkedAt < 60_000) {
    return shortageSchemaCheck.value;
  }
  try {
    const result = await pool.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'order_line_shortages'
       ) AS present`,
    );
    const value = Boolean(result.rows[0]?.present);
    shortageSchemaCheck = { value, checkedAt: Date.now() };
    return value;
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      shortageSchemaCheck = { value: false, checkedAt: Date.now() };
      return false;
    }
    throw error;
  }
}

async function hasReplenishmentSchema(): Promise<boolean> {
  if (replenishmentSchemaCheck && (Date.now() - replenishmentSchemaCheck.checkedAt) < 60_000) {
    return replenishmentSchemaCheck.value;
  }

  try {
    const result = await pool.query(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name = 'replenishment_requests'
       ) AS present`
    );

    const value = Boolean(result.rows[0]?.present);
    replenishmentSchemaCheck = { value, checkedAt: Date.now() };
    return value;
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      replenishmentSchemaCheck = { value: false, checkedAt: Date.now() };
      return false;
    }
    throw error;
  }
}

/** Optional tables the projection degrades around (checked at most once a minute). */
export interface OrdersListSchema {
  hasShortage: boolean;
  hasReplenishment: boolean;
}

/* Joins the list projection AND the search prefilter (`search_hits`) share:
 * the search predicate reads their aliases, so both sides must see one text.
 * Stage facts (pick / QC / pack actors and assignees) are one primary-key row
 * of `order_stage_facts`, kept by refreshOrderStageFacts. */
const STAGE_STAFF_JOINS = `${ORDER_STAGE_FACTS_JOIN}
    LEFT JOIN staff staff_picker
      ON staff_picker.id = osf.picker_id
     AND staff_picker.organization_id = o.organization_id
    LEFT JOIN staff staff_packed_by ON staff_packed_by.id = osf.packed_by
    LEFT JOIN staff staff_pack_assignee ON staff_pack_assignee.id = osf.packer_id`;
const SS_REF_LATERAL = `LEFT JOIN LATERAL (
      SELECT ssr.ship_to, ssr.account_source, ssr.marketplace, ssr.line_items
        FROM shipstation_order_refs ssr
       WHERE ssr.organization_id = o.organization_id
         AND ssr.order_row_id = o.id
       ORDER BY ssr.last_seen_at DESC NULLS LAST, ssr.id DESC
       LIMIT 1
    ) ss_ref ON TRUE`;
/** Exact marketplace image ShipStation already persisted on this order line. */
const SS_IMAGE_LATERAL = `LEFT JOIN LATERAL (
      SELECT NULLIF(BTRIM(line.item->>'imageUrl'), '') AS image_url
        FROM jsonb_array_elements(COALESCE(ss_ref.line_items, '[]'::jsonb))
             WITH ORDINALITY AS line(item, ordinal)
       WHERE COALESCE(line.item->>'adjustment', 'false') <> 'true'
         AND NULLIF(BTRIM(line.item->>'imageUrl'), '') IS NOT NULL
       ORDER BY CASE
                  WHEN NULLIF(BTRIM(o.sku), '') IS NOT NULL
                   AND UPPER(BTRIM(line.item->>'sku')) = UPPER(BTRIM(o.sku)) THEN 0
                  ELSE 1
                END,
                line.ordinal
       LIMIT 1
    ) shipstation_image ON TRUE`;
/** The row's ship-by deadline — the list's sort key and the shipBy filters' operand (alias `wa_deadline`; also the locate's `shipBy`). */
export const WA_DEADLINE_LATERAL = `LEFT JOIN LATERAL (
      SELECT wa.deadline_at
        FROM work_assignments wa
       WHERE wa.organization_id = o.organization_id
         AND wa.entity_type = 'ORDER'
         AND wa.entity_id = o.id
         AND wa.work_type = 'TEST'
       ORDER BY ${WA_TEST_DEADLINE_RANK_ORDER_SQL('wa')}
       LIMIT 1
    ) wa_deadline ON TRUE`;
/**
 * Every relation a list WHERE / ORDER BY can name (o, sc, wa_deadline, osf and
 * its staff, stn, cust, ss_ref), and nothing only the projection reads. Each
 * join is 1:1 per order, so ranking over it picks the same rows as the full read.
 */
const PAGE_RANK_FROM_SQL = `FROM orders o
    LEFT JOIN sku_catalog sc ON sc.id = o.sku_catalog_id
    ${WA_DEADLINE_LATERAL}
    ${STAGE_STAFF_JOINS}
    LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
    LEFT JOIN customers cust
      ON cust.id = o.customer_id AND cust.organization_id = o.organization_id
    ${SS_REF_LATERAL}`;

/** One list read as SQL + binds. Membership predicates are the shared builders the desk counts use. */
export function buildOrdersListSql(
  orgId: string,
  q: OrdersListQuery,
  { hasShortage, hasReplenishment }: OrdersListSchema,
): { sql: string; params: unknown[] } {
  const {
    orderIdFilter, singleOrderMode, status, assignedTo, query, weekStart, weekEnd,
    packedDateFrom, packedDateTo, assignmentStatus, shipByDate, staffFilterId,
    includeShipped, shippedOnly, packedOnly, excludePacked, awaitingOnly, fulfillmentScope,
    poPaired, inWarehouse, blockedOnly, stagedOnly, exceptionsOnly, stallHours,
    carrierFilter, statusCategoryFilter, queueShape, stageFilter, pageLimit, cursor,
  } = q;
  const shippedByCarrierOrLatestStatusSql = SHIPPED_BY_CARRIER_SQL;
  const shortageLinkSelect = hasShortage
    ? `(
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
      ) AS shortage_link_status,`
    : `NULL::text AS shortage_link_status,`;
  const replenishmentSelect = hasReplenishment
    ? `
      rr.id AS replenishment_request_id,
      rr.status AS replenishment_status,
      rr.quantity_to_order AS replenishment_quantity_to_order,
      rr.zoho_po_number AS replenishment_po_number,
      rr.notes AS replenishment_notes,`
    : `
      NULL::uuid AS replenishment_request_id,
      NULL::text AS replenishment_status,
      NULL::numeric AS replenishment_quantity_to_order,
      NULL::text AS replenishment_po_number,
      NULL::text AS replenishment_notes,`;
  // The order's latest replenishment request: one index probe per order
  // (rol_order_idx). Was a whole-table ROW_NUMBER CTE the planner nested-looped
  // against every candidate order (~195 ms of a 717 ms feed read, 2026-09-27).
  const replenishmentJoin = hasReplenishment
    ? `LEFT JOIN LATERAL (
      SELECT req.id, req.status, req.quantity_to_order, req.zoho_po_number, req.notes
      FROM replenishment_order_lines rol
      JOIN replenishment_requests req
        ON req.id = rol.replenishment_request_id AND req.organization_id = rol.organization_id
      WHERE rol.order_id = o.id
        AND rol.organization_id = o.organization_id
      ORDER BY rol.created_at DESC, rol.id DESC
      LIMIT 1
    ) rr ON TRUE`
    : '';
  // listShape=queue omits the heavy per-order multi-tracking arrays (a details-panel concern) — the row chip uses the single…
  const trackingArraysSelect = queueShape
    ? `'[]'::json AS tracking_numbers,
      '[]'::json AS tracking_number_rows,`
    : `COALESCE(order_trackings.tracking_numbers, '[]'::json) AS tracking_numbers,
      COALESCE(order_trackings.tracking_number_rows, '[]'::json) AS tracking_number_rows,`;
  // Full shape only: columns no queue surface (To-ship cards, quick look,
  // record, /m/pick) reads — the single-row / full-list readers keep them.
  const fullShapeOnlySelect = queueShape
    ? ''
    : `stn.estimated_delivery_at::text AS estimated_delivery_at,
      o.tracking_added_at::text AS tracking_added_at,`;
  let sql = `
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
      ${trackingArraysSelect}
      COALESCE(sc.sku, o.sku) AS sku,
      o.condition,
      o.is_out_of_stock,
      o.oos_kind,
      o.oos_sku,
      o.oos_sku_catalog_id,
      o.oos_kit_part_id,
      o.oos_qty_short,
      o.oos_title,
      ${hasShortage ? 'o.oos_zoho_item_id,' : 'NULL::text AS oos_zoho_item_id,'}
      ${shortageLinkSelect}
      o.status,
      o.notes,
      -- Marketplace buyer note (migration 2026-07-03p): painted inline on the
      -- record as its NOTE badge.
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
      o.service_level,
      /* The service of the label bought for a paid-for fast order, so the row can
       * flag a downgrade (2-day shipped Ground). Probed only for urgent levels:
       * latest live ShipStation shipment, else the in-app label purchase. */
      CASE WHEN o.service_level IN (${sqlInList(URGENT_SERVICE_LEVELS)}) THEN COALESCE(
        (SELECT sh.service_code FROM shipstation_shipment_refs sh
          WHERE sh.organization_id = o.organization_id AND sh.order_row_id = o.id
            AND NOT sh.voided AND NOT sh.is_return_label
          ORDER BY sh.create_date DESC NULLS LAST, sh.id DESC LIMIT 1),
        (SELECT slp.service_code FROM shipping_label_purchases slp
          WHERE slp.organization_id = o.organization_id AND slp.order_id = o.id
            AND NOT slp.is_test AND slp.unlinked_at IS NULL AND slp.purpose IS DISTINCT FROM 'return'
          ORDER BY slp.created_at DESC LIMIT 1)
      ) END AS label_service_code,
      o.sale_amount,
      o.currency,
      ${replenishmentSelect}
      o.customer_id,
      /* The linked buyer from the customer book (CustomerRecord DTO), so the
       * row and the evidence column read name / ship-to without a fetch per
       * row. NULL when the order has no customer_id. */
      ${customerDisplayJsonSql('cust')} AS customer,
      /* The ship-to the paired ShipStation order carries (ShipStation shipTo
       * keys). The buyer resolver uses it only when no customer-book row wins. */
      ss_ref.ship_to AS shipstation_ship_to,
      stn.latest_status_code,
      stn.latest_status_label,
      stn.latest_status_description,
      stn.latest_status_category,
      stn.carrier,
      stn.latest_event_at::text AS latest_event_at,
      stn.has_exception,
      ${fullShapeOnlySelect}
      stn.delivered_at::text AS delivered_at,
      stn.exception_at::text AS exception_at,
      stn.is_terminal,
      ${shippedByCarrierOrLatestStatusSql} AS is_shipped,
      to_char(timezone('America/Los_Angeles', o.created_at), 'YYYY-MM-DD HH24:MI:SS') AS created_at,
      o.label_printed_at::text  AS label_printed_at,
      osf.picker_id            AS picker_id,
      staff_picker.name        AS picker_name,
      staff_picker.color_hex   AS picker_color_hex,
      osf.packer_id            AS packer_id,
      osf.packer_log_id,
      osf.packed_at,
      osf.packed_by,
      to_char(osf.pack_activity_at, 'YYYY-MM-DD HH24:MI:SS') AS pack_activity_at,
      to_char(dock_stage.dock_staged_at, 'YYYY-MM-DD HH24:MI:SS') AS dock_staged_at,
      allocation_facts.storage_locations,
      allocation_facts.allocated_unit_count,
      allocation_facts.picked_unit_count,
      sku_home.location AS sku_home_location,
      sku_on_hand.on_hand AS sku_stock_on_hand,
      /*
       * QC is a UNIT fact: the latest bench verdict (testing_results) on a
       * unit allocated to this order. Never a station scan — the Picker
       * desk's scan is the pick below, and no row feeds both stages.
       */
      osf.qc_by AS tested_by,
      to_char(osf.qc_at, 'YYYY-MM-DD HH24:MI:SS') AS test_activity_at,
      osf.qc_verdict AS qc_verdict,
      COALESCE(osf.qc_inherited, false) AS qc_inherited,
      qc_assign.assigned_tech_id AS qc_assignee_id,
      staff_qc_assignee.name     AS qc_assignee_name,
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
      staff_qc.name            AS tested_by_name,
      staff_pack_assignee.name AS packer_name,
      staff_packed_by.name     AS packed_by_name,
      /* Pick facts: the picked-by resolver (src/lib/picking/picked-by.ts),
       * materialized on the facts row. */
      osf.picked_by AS picked_by,
      s_picked.name AS picked_by_name,
      to_char(osf.picked_at, 'YYYY-MM-DD HH24:MI:SS') AS picked_at,
      osf.picked_source AS picked_source,
      /*
       * Dock scan-out. The field catalog documented this column as "dashes
       * honestly on a feed that does not stamp it yet" — this is that feed,
       * so the dash was the gap, not the truth. Operator 2026-09-14: tie the
       * routes together, so Pick · Pack · Scanned-out all read on one row.
       */
      to_char(ship_out.ship_confirmed_at, 'YYYY-MM-DD HH24:MI:SS') AS ship_confirmed_at,
      ship_out.shipped_out_by AS shipped_out_by,
      shipped_out_staff.name  AS shipped_out_by_name,
      ${PREBOX_FACTS_SELECT},
      staff_pack_assignee.color_hex AS packer_color_hex,
      ${ORDER_STAGE_FACTS_SIGNALS.hasPickScan} AS has_pick_scan,
      opp.location_id AS pack_location_id,
      COALESCE(NULLIF(BTRIM(loc_pack.display_name), ''), loc_pack.name) AS pack_location_name,
      loc_pack.location_kind AS pack_location_kind,
      o.sku_catalog_id,
      COALESCE(
        NULLIF(BTRIM(sc.image_url), ''),
        listing_cover.image_url,
        ecwid_image.image_url,
        order_listing_image.image_url,
        shipstation_image.image_url
      ) AS catalog_image_url,
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
      /* The ShipStation ref is store-attributed through integration_store_links
       * at ingest time. It is more specific than legacy orders.account_source
       * values such as bare "eBay" (for example eBay · DRAGON). */
      COALESCE(NULLIF(BTRIM(ss_ref.account_source), ''), o.account_source) AS account_source,
      o.admin_url,
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
    /* Second tier (owner 2026-09-29: catalog → cover → Zoho): the SKU
     * listing-gallery cover — a product photo uploaded on a record, or the
     * acquired Amazon/eBay media (lib/photos/marketplace-media-backfill.ts).
     * The paired catalog row wins; an unpaired order reaches its catalog row
     * by the exact, org-scoped SKU. */
    LEFT JOIN LATERAL (
      SELECT ${listingCoverThumbUrlSql('sc_cover')} AS image_url
        FROM sku_catalog sc_cover
       WHERE sc_cover.organization_id = o.organization_id
         AND (sc_cover.id = o.sku_catalog_id
              OR (o.sku_catalog_id IS NULL AND sc_cover.sku = o.sku))
       LIMIT 1
    ) listing_cover ON TRUE
    /* Final fallback for marketplace orders that have not been paired to a
     * catalog SKU yet. The backfill links the source image to the order, so
     * Allocate and Search can paint it immediately without inventing an SKU
     * relationship. Once the order is paired, every catalog tier above wins. */
    LEFT JOIN LATERAL (
      SELECT COALESCE(
               (SELECT NULLIF(BTRIM(ps.legacy_url), '')
                  FROM photo_storage ps
                 WHERE ps.organization_id = pel.organization_id
                   AND ps.photo_id = pel.photo_id
                   AND ps.provider = 'legacy_url'
                   AND ps.is_primary = TRUE
                 LIMIT 1),
               '/api/photos/' || pel.photo_id::text || '/content?variant=thumb'
             ) AS image_url
        FROM photo_entity_links pel
        JOIN photos p
          ON p.id = pel.photo_id
         AND p.organization_id = pel.organization_id
       WHERE pel.organization_id = o.organization_id
         AND pel.entity_type = 'ORDER'
         AND pel.entity_id = o.id
         AND p.photo_type = 'listing'
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT 1
    ) order_listing_image ON TRUE
    ${WA_DEADLINE_LATERAL}
    ${STAGE_STAFF_JOINS}
    LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
    LEFT JOIN customers cust
      ON cust.id = o.customer_id AND cust.organization_id = o.organization_id
    ${SS_REF_LATERAL}
    ${SS_IMAGE_LATERAL}
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
       AND room.location_kind = 'ROOM' /* a rack shelf's parent is its rack, not a room */
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
         AND home_room.location_kind = 'ROOM'
       WHERE stock.organization_id = o.organization_id
         /* CASE, not COALESCE: CoalesceExpr is never leakproof, so under
          * forced RLS the COALESCE form could not be an index condition and
          * scanned every sku_stock row of the org per order (3.3 s vs 17 ms). */
         AND stock.sku = CASE WHEN sc.sku IS NOT NULL THEN sc.sku ELSE o.sku END
         AND NULLIF(btrim(stock.location), '') IS NOT NULL
       LIMIT 1
    ) sku_home ON TRUE
    /* The SKU's on-hand count (sku_stock.stock, ledger-maintained) — the order
     * card's "Stock n". Same CASE key as sku_home so it stays an index lookup. */
    LEFT JOIN LATERAL (
      SELECT SUM(stock.stock)::int AS on_hand
        FROM sku_stock stock
       WHERE stock.organization_id = o.organization_id
         AND stock.sku = CASE WHEN sc.sku IS NOT NULL THEN sc.sku ELSE o.sku END
    ) sku_on_hand ON TRUE
    LEFT JOIN staff s_picked ON s_picked.id = osf.picked_by
    LEFT JOIN staff staff_qc
      ON staff_qc.id = osf.qc_by
     AND staff_qc.organization_id = o.organization_id
    /* QC assignee: receiving_line_testing.assigned_tech_id of the ORIGIN receiving
     * line of a unit live-allocated to this order (org-scoped). QC is unit work,
     * assigned on the line the unit was received on. */
    LEFT JOIN LATERAL (
      SELECT rlt.assigned_tech_id
        FROM order_unit_allocations qa_oua
        JOIN serial_unit_provenance qa_p
          ON qa_p.serial_unit_id  = qa_oua.serial_unit_id
         AND qa_p.organization_id = qa_oua.organization_id
         AND qa_p.origin_type     = 'RECEIVING_LINE'
         AND qa_p.origin_id IS NOT NULL
        JOIN receiving_line_testing rlt
          ON rlt.receiving_line_id = qa_p.origin_id
         AND rlt.organization_id   = qa_oua.organization_id
       WHERE qa_oua.order_id        = o.id
         AND qa_oua.organization_id = o.organization_id
         AND qa_oua.state NOT IN ('RELEASED', 'RETURNED')
         AND rlt.assigned_tech_id IS NOT NULL
       ORDER BY qa_oua.allocated_at DESC, qa_oua.id DESC
       LIMIT 1
    ) qc_assign ON TRUE
    LEFT JOIN staff staff_qc_assignee
      ON staff_qc_assignee.id = qc_assign.assigned_tech_id
     AND staff_qc_assignee.organization_id = o.organization_id
    ${SHIP_OUT_LATERAL}
    ${PREBOX_FACTS_LATERAL}
    ${DOCK_STAGING_LATERAL}
    ${PRICE_FACTS_LATERALS}
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
        WHERE osl_link.organization_id = o.organization_id
          AND osl_link.owner_type = 'ORDER' AND osl_link.owner_id = o.id

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
        WHERE o_sibling.organization_id = o.organization_id
          AND o_sibling.order_id = o.order_id
      ) t
    ) order_trackings ON TRUE
    ${replenishmentJoin}
    WHERE 1=1
  `;
  // $1 = org; $2 = the single-row pk, bound up front (single-order mode).
  const params: unknown[] = singleOrderMode ? [orgId, orderIdFilter] : [orgId];
  let paramCount = params.length + 1;

  // Everything appended from here to the ORDER BY is the list's filter, reused by the page-rank gate below.
  const filterStart = sql.length;
  sql += ` AND o.organization_id = $1`;

  if (shippedOnly) {
    sql += ` AND ${shippedByCarrierOrLatestStatusSql}`;
  } else if (inWarehouse && !blockedOnly) {
    // To-ship desk: the ONE predicate desk-counts `triage`, queue-counts and the
    // nav facets count (label + non-blank tracking, not carrier-shipped, no dock
    // SHIP_CONFIRM, not AFN), so the list and its counters cannot disagree.
    sql += ` AND ${sqlOrderInWarehouseToShip('o')}`;
  } else if (!includeShipped && !packedOnly) {
    if (!blockedOnly) {
      // Open (unshipped) — not carrier-shipped (even when excludePacked is also
      // active), no dock scan-out (the Shipped desk), not Amazon-fulfilled.
      // The ONE predicate Allocate's reach counts (`sqlOrderOpenUnshipped`).
      sql += ` AND ${sqlOrderOpenUnshipped('o')}`;
    } else {
      // Blocked OOS work remains actionable even when a stale carrier status
      // says "shipped"; `sqlOrderBlockedPending` below still excludes real dock
      // ship-confirm rows. Amazon-fulfilled (FBA/AFN) orders are read-only
      // records — Amazon ships them, so they never belong on a to-do list.
      sql += ` AND COALESCE(o.fulfillment_channel, '') <> 'AFN'`;
    }
  }

  if (packedOnly) {
    // CF-04: order-grain pack fact (not any SAL on the shared shipment).
    sql += ` AND ${ORDER_STAGE_FACTS_SIGNALS.hasPackScan}`;
  } else if (excludePacked) {
    sql += ` AND NOT ${ORDER_STAGE_FACTS_SIGNALS.hasPackScan}`;
  }

  if (awaitingOnly) {
    // Awaiting a label — a counter pickup never gets one.
    sql += ` AND o.shipment_id IS NULL AND COALESCE(o.fulfillment_channel, '') <> '${PICKUP_FULFILLMENT_CHANNEL}'`;
  }

  if (fulfillmentScope) {
    /* Pre-pack board = every order that has not been packed yet, INCLUDING the ones with no label (2026-08-30 operator ruling). */
    // CF-04: exclude only when THIS order has a pack fact — not when a sibling
    // sharing the carton was packed (shipment-grain NOT EXISTS was the vanish bug).
    sql += ` AND NOT ${ORDER_STAGE_FACTS_SIGNALS.hasPackScan}`;
    // Operator 2026-09-09: exception-held (caged ∩ unpaired) stays ON
    // To-ship so staff see pending work here, not only on Exceptions.
    sql += ` AND NOT ${sqlOrderHasShipConfirm('o')}`;
  }
  if (blockedOnly) {
    // Shortage/pending must retain operator-blocked OOS work even when it has
    // no label or is already caged; only a real ship-confirm leaves the queue.
    sql += ` AND ${sqlOrderBlockedPending('o')}`;
  }

  // Shortage desk · PO paired: an open shortage line earmarked onto a PO or
  // receiving line (same fragment the desk-counts `po` badge reads). No
  // shortage tables ⇒ nothing can be paired.
  if (poPaired) {
    sql += hasShortage ? ` AND ${sqlOrderHasPoPairedShortage('o')}` : ` AND false`;
  }

  if (stagedOnly) {
    sql += ` AND EXISTS (
      SELECT 1 FROM station_activity_logs sal_pack
      WHERE sal_pack.shipment_id IS NOT NULL
        AND sal_pack.shipment_id = o.shipment_id
        AND sal_pack.activity_type IN (${sqlInList(PACK_ACTIVITY_TYPES)})
    )`;
    sql += ` AND NOT ${sqlOrderHasShipConfirm('o')}`;
    sql += ` AND NOT ${shippedByCarrierOrLatestStatusSql}`;
    sql += ` AND COALESCE(o.fulfillment_channel, '') <> 'AFN'`;
    if (packedDateFrom || packedDateTo) {
      const packedDaySql = `timezone('${WAREHOUSE_TIME_ZONE}', COALESCE(osf.packed_at, osf.pack_activity_at))::date`;
      if (packedDateFrom) {
        sql += ` AND ${packedDaySql} >= $${paramCount++}::date`;
        params.push(packedDateFrom);
      }
      if (packedDateTo) {
        sql += ` AND ${packedDaySql} <= $${paramCount++}::date`;
        params.push(packedDateTo);
      }
    }
  }

  if (carrierFilter) {
    sql += ` AND stn.carrier = $${paramCount++}`;
    params.push(carrierFilter);
  }

  if (statusCategoryFilter) {
    sql += ` AND stn.latest_status_category = $${paramCount++}`;
    params.push(statusCategoryFilter);
  }

  // CF-04 / CF-03: stage facet is order-grain (not any SAL on the shared carton).
  // `packed` is only meaningful under inWarehouse (packed-staged still here).
  if (stageFilter) {
    sql += ` AND ${sqlOrderDeskStage(stageFilter, 'o', ORDER_STAGE_FACTS_SIGNALS)}`;
  }

  if (exceptionsOnly) {
    sql += ` AND (
      stn.has_exception = true
      OR (
        stn.is_terminal = false
        AND stn.latest_status_category IN ('IN_TRANSIT','OUT_FOR_DELIVERY','EXCEPTION','RETURNED')
        AND (
          stn.latest_event_at IS NULL
          OR stn.latest_event_at < (NOW() - ($${paramCount} || ' hours')::interval)
        )
      )
    )`;
    params.push(String(stallHours));
    paramCount++;
  }

  if (status) {
    sql += ` AND o.status = $${paramCount++}`;
    params.push(status);
  }

  if (assignedTo) {
    // legacy: assignedTo maps to packer assignment
    sql += ` AND osf.packer_id = $${paramCount++}`;
    params.push(Number(assignedTo));
  }

  // packedBy / pickerId / pickedBy / orderFrom|To / shipByFrom|To — the same
  // predicates the outbound nav facets bind, so their totals match this list.
  for (const clause of sqlDeskRefinementClauses(
    q,
    (value) => {
      params.push(value);
      return `$${paramCount++}`;
    },
    'o',
    'wa_deadline.deadline_at',
    ORDER_STAGE_FACTS_SIGNALS,
  )) {
    sql += ` AND ${clause}`;
  }

  if (staffFilterId != null) {
    // Same predicate queue-counts and the nav facets use for `?staff=`.
    sql += ` AND ${sqlOrderAssignedToStaff(`$${paramCount}`, 'o')}`;
    params.push(staffFilterId);
    paramCount++;
  }

  if (assignmentStatus === 'unassigned') {
    sql += `
      AND NOT EXISTS (
        SELECT 1 FROM work_assignments wa
        WHERE wa.organization_id = o.organization_id
          AND wa.entity_type = 'ORDER' AND wa.entity_id = o.id
          AND wa.status IN ('ASSIGNED', 'IN_PROGRESS')
      )`;
  } else if (assignmentStatus === 'assigned') {
    sql += `
      AND EXISTS (
        SELECT 1 FROM work_assignments wa
        WHERE wa.organization_id = o.organization_id
          AND wa.entity_type = 'ORDER' AND wa.entity_id = o.id
          AND wa.status IN ('ASSIGNED', 'IN_PROGRESS')
      )`;
  }

  if (shipByDate) {
    sql += ` AND COALESCE(wa_deadline.deadline_at::date, (o.created_at AT TIME ZONE 'America/Los_Angeles')::date) = $${paramCount++}`;
    params.push(shipByDate);
  } else {
    if (weekStart) {
      sql += ` AND COALESCE(wa_deadline.deadline_at::date, (o.created_at AT TIME ZONE 'America/Los_Angeles')::date) >= $${paramCount++}`;
      params.push(weekStart);
    }
    if (weekEnd) {
      sql += ` AND COALESCE(wa_deadline.deadline_at::date, (o.created_at AT TIME ZONE 'America/Los_Angeles')::date) <= $${paramCount++}`;
      params.push(weekEnd);
    }
  }

  const trimmedQuery = ordersSearchNeedle(query);
  const likeValue = ordersSearchLikePattern(query);
  const last8 = ordersSearchLast8(query);
  const key18 = ordersSearchTrackingKey18(query);

  // The search predicate runs in the `search_hits` prefilter (built below),
  // not on this projection: here it could only be checked after every per-row
  // lateral had run for every order of the org.
  let searchPredicate = '';
  if (likeValue) {
    const likeParam = paramCount;
    searchPredicate += `(
      o.product_title ILIKE $${likeParam}
      OR COALESCE(sc.product_title, '') ILIKE $${likeParam}
      OR COALESCE(sc.sku, '') ILIKE $${likeParam}
      OR COALESCE(sc.category, '') ILIKE $${likeParam}
      OR COALESCE(sc.upc, '') ILIKE $${likeParam}
      OR COALESCE(sc.ean, '') ILIKE $${likeParam}
      OR COALESCE(sc.gtin, '') ILIKE $${likeParam}
      OR COALESCE(o.sku, '') ILIKE $${likeParam}
      OR COALESCE(o.condition, '') ILIKE $${likeParam}
      OR COALESCE(staff_picker.name, '') ILIKE $${likeParam}
      OR COALESCE(staff_pack_assignee.name, '') ILIKE $${likeParam}
      OR COALESCE(staff_packed_by.name, '') ILIKE $${likeParam}
      OR COALESCE(o.order_id, '') ILIKE $${likeParam}
      OR COALESCE(o.item_number, '') ILIKE $${likeParam}
      OR COALESCE(stn.tracking_number_raw, '') ILIKE $${likeParam}
      OR COALESCE(o.status, '') ILIKE $${likeParam}
      OR COALESCE(o.notes, '') ILIKE $${likeParam}
      OR COALESCE(NULLIF(BTRIM(ss_ref.account_source), ''), o.account_source, '') ILIKE $${likeParam}
      OR COALESCE(o.quantity, '') ILIKE $${likeParam}
      OR COALESCE(o.customer_id::text, '') ILIKE $${likeParam}
      OR o.id::text ILIKE $${likeParam}
      OR COALESCE(cust.display_name, '') ILIKE $${likeParam}
      OR COALESCE(cust.customer_name, '') ILIKE $${likeParam}
      OR concat_ws(' ', cust.first_name, cust.last_name) ILIKE $${likeParam}
      OR COALESCE(cust.email, '') ILIKE $${likeParam}
      OR COALESCE(ss_ref.ship_to->>'name', '') ILIKE $${likeParam}
    `;
    params.push(likeValue);
    paramCount++;

    if (last8) {
      searchPredicate += ` OR RIGHT(regexp_replace(COALESCE(o.order_id, ''), '[^0-9]', '', 'g'), 8) = $${paramCount}
        OR RIGHT(regexp_replace(UPPER(COALESCE(stn.tracking_number_normalized, '')), '[^A-Z0-9]', '', 'g'), 8) = $${paramCount}`;
      params.push(last8);
      paramCount++;
    }

    if (key18) {
      searchPredicate += ` OR o.shipment_id IN (
        SELECT s.id FROM shipping_tracking_numbers s
        WHERE RIGHT(regexp_replace(UPPER(COALESCE(s.tracking_number_normalized, '')), '[^A-Z0-9]', '', 'g'), 18) = $${paramCount}
      )`;
      params.push(key18);
      paramCount++;
    }

    // A caller reads out their phone number: match its last 10 digits on the
    // customer and on the ShipStation ship-to, however either is formatted.
    const phoneDigits = trimmedQuery.replace(/\D/g, '');
    if (phoneDigits.length >= 7 && phoneDigits.length <= 15 && !/[a-z]/i.test(trimmedQuery)) {
      const phoneKey = phoneDigits.slice(-10);
      searchPredicate += ` OR RIGHT(regexp_replace(COALESCE(cust.phone, ''), '\\D', '', 'g'), 10) = $${paramCount}
        OR RIGHT(regexp_replace(COALESCE(cust.mobile, ''), '\\D', '', 'g'), 10) = $${paramCount}
        OR RIGHT(regexp_replace(COALESCE(ss_ref.ship_to->>'phone', ''), '\\D', '', 'g'), 10) = $${paramCount}`;
      params.push(phoneKey);
      paramCount++;
    }

    if (/^\d+$/.test(trimmedQuery) && trimmedQuery.length <= 10) {
      searchPredicate += ` OR o.id = $${paramCount}
        OR COALESCE(o.customer_id, -1) = $${paramCount}`;
      params.push(Number(trimmedQuery));
      paramCount++;
    }

    searchPredicate += `
      OR (
        NULLIF(BTRIM(o.order_id), '') IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM orders om
          LEFT JOIN sku_catalog scm ON scm.id = om.sku_catalog_id
          LEFT JOIN shipping_tracking_numbers stnm ON stnm.id = om.shipment_id
          WHERE om.organization_id = o.organization_id
            AND om.order_id = o.order_id
            AND (
              om.product_title ILIKE $${likeParam}
              OR COALESCE(scm.product_title, '') ILIKE $${likeParam}
              OR COALESCE(scm.sku, '') ILIKE $${likeParam}
              OR COALESCE(om.sku, '') ILIKE $${likeParam}
              OR COALESCE(om.order_id, '') ILIKE $${likeParam}
              OR COALESCE(om.item_number, '') ILIKE $${likeParam}
              OR COALESCE(stnm.tracking_number_raw, '') ILIKE $${likeParam}
              OR om.id::text ILIKE $${likeParam}
            )
        )
      )
      -- A serial on the order (operator 2026-10-08: serials found nothing).
      -- Uncorrelated one-shot arrays: lower(serial_number) LIKE rides the
      -- trigram index, never a per-order subquery. Linked by order id, or by
      -- the order's shipment when the serial row carries no order.
      OR o.id = ANY (ARRAY(
        SELECT tsn_q.order_id FROM tech_serial_numbers tsn_q
         WHERE tsn_q.organization_id = $1
           AND tsn_q.order_id IS NOT NULL
           AND lower(tsn_q.serial_number) LIKE lower($${likeParam})
      ))
      OR o.shipment_id = ANY (ARRAY(
        SELECT tsn_q.shipment_id FROM tech_serial_numbers tsn_q
         WHERE tsn_q.organization_id = $1
           AND tsn_q.order_id IS NULL
           AND tsn_q.shipment_id IS NOT NULL
           AND lower(tsn_q.serial_number) LIKE lower($${likeParam})
      ))
    )`;
    // `= ANY(ARRAY(...))` is a one-shot InitPlan feeding a pk index scan; an
    // IN semi-join is placed above the laterals (the OR-of-ILIKE estimate is
    // ~75% of the org), which runs them for every order again.
    sql += ` AND o.id = ANY (ARRAY(SELECT id FROM search_hits))`;
  }

  if (singleOrderMode) {
    sql += ` AND o.id = $2`;
  }

  // Keyset cursor: fulfillment is `o.id DESC`; everything else is
  // `deadline_at ASC NULLS LAST, id ASC`.
  if (cursor) {
    if (fulfillmentScope) {
      sql += ` AND o.id < $${paramCount++}`;
      params.push(cursor.id);
    } else if (cursor.d != null) {
      sql += ` AND (
        wa_deadline.deadline_at > $${paramCount}::timestamptz
        OR (wa_deadline.deadline_at = $${paramCount}::timestamptz AND o.id > $${paramCount + 1})
        OR wa_deadline.deadline_at IS NULL
      )`;
      params.push(cursor.d, cursor.id);
      paramCount += 2;
    } else {
      sql += ` AND wa_deadline.deadline_at IS NULL AND o.id > $${paramCount++}`;
      params.push(cursor.id);
    }
  }

  // Fulfillment is newest-synced first: `orders.created_at` defaults to the
  // insert time, so `id DESC` is that order and keeps the id-only cursor.
  const orderBySql = fulfillmentScope
    ? ` ORDER BY o.id DESC`
    : ` ORDER BY wa_deadline.deadline_at ASC NULLS LAST, o.id ASC`;

  // Fetch one extra row to detect truncation + mint the next keyset cursor.
  // Only when an explicit limit is set — unlimited callers are unchanged.
  if (pageLimit != null) {
    const limitParam = `$${paramCount++}`;
    params.push(pageLimit + 1);
    // Rank before decorating: the same WHERE + ORDER BY over only the joins
    // they read picks the page ids (a one-shot InitPlan), so the ~20 display
    // laterals run for the page instead of every candidate order. The To-ship
    // queue at limit 200 decorated 1,935 orders: ~340 → ~60 ms.
    const filterSql = sql.slice(filterStart);
    sql += ` AND o.id = ANY (ARRAY(SELECT o.id ${PAGE_RANK_FROM_SQL} WHERE 1=1${filterSql}${orderBySql} LIMIT ${limitParam}))`;
    sql += `${orderBySql} LIMIT ${limitParam}`;
  } else {
    sql += orderBySql;
  }

  // Only the joins the predicate reads, evaluated once per org order; the
  // list's per-row laterals then run for the hits alone.
  const searchHitsCte = searchPredicate
    ? `WITH search_hits AS (
      SELECT o.id
      FROM orders o
      LEFT JOIN sku_catalog sc ON sc.id = o.sku_catalog_id
      LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
      LEFT JOIN customers cust
        ON cust.id = o.customer_id AND cust.organization_id = o.organization_id
      ${SS_REF_LATERAL}
      ${STAGE_STAFF_JOINS}
      WHERE o.organization_id = $1${singleOrderMode ? ' AND o.id = $2' : ''}
        AND ${searchPredicate}
    )`
    : '';
  return { sql: `${searchHitsCte}${sql}`, params };
}

export interface OrdersListPayload {
  orders: Record<string, unknown>[];
  count: number;
  nextCursor: string | null;
  truncated: boolean;
  weekStart: string | null;
  weekEnd: string | null;
}

export type OrdersListCacheState = 'HIT' | 'MISS' | 'BYPASS';

export interface OrdersListDeps {
  readSchema(): Promise<OrdersListSchema>;
  query(orgId: string, sql: string, params: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  cacheGet(key: string): Promise<OrdersListPayload | null>;
  cacheSet(key: string, payload: OrdersListPayload): Promise<void>;
}

const defaultDeps: OrdersListDeps = {
  readSchema: async () => {
    const [hasReplenishment, hasShortage] = await Promise.all([
      hasReplenishmentSchema(),
      hasShortageSchema(),
    ]);
    return { hasReplenishment, hasShortage };
  },
  // One round trip (GUC + statement) instead of BEGIN / set_config / query / COMMIT.
  query: (orgId, sql, params) => tenantQueryOneTrip(orgId, sql, params),
  cacheGet: (key) => getCachedJson<OrdersListPayload>('api:orders', key),
  cacheSet: (key, payload) => setCachedJson('api:orders', key, payload, 300, ['orders']),
};

/** The schema probe {@link buildOrdersListSql} needs — for callers that wrap the list SQL. */
export const readOrdersListSchema: () => Promise<OrdersListSchema> = defaultDeps.readSchema;

/** Cache-aside list read. Search and single-row reads bypass the cache. */
export async function listOrders(
  orgId: string,
  q: OrdersListQuery,
  deps: OrdersListDeps = defaultDeps,
): Promise<{ payload: OrdersListPayload; cache: OrdersListCacheState }> {
  const cacheable = !q.singleOrderMode && !q.hasSearchQuery;
  const cacheLookup = ordersListCacheLookupKey(orgId, q);
  if (cacheable) {
    const cached = await deps.cacheGet(cacheLookup);
    if (cached) return { payload: cached, cache: 'HIT' };
  }

  const { pageLimit, weekStart, weekEnd } = q;
  const { sql, params } = buildOrdersListSql(orgId, q, await deps.readSchema());
  const result = await deps.query(orgId, sql, params);

  let rows = result.rows;
  let nextCursor: string | null = null;
  let truncated = false;
  if (pageLimit != null && rows.length > pageLimit) {
    truncated = true;
    rows = rows.slice(0, pageLimit);
    const last = rows[rows.length - 1] as { deadline_at?: unknown; id?: unknown };
    const d = last?.deadline_at == null
      ? null
      : last.deadline_at instanceof Date
        ? last.deadline_at.toISOString()
        : String(last.deadline_at);
    nextCursor = encodeOrdersListCursor({ d, id: Number(last?.id) });
  }

  /* Three facts in, one number out. */
  interface PriceColumns {
    sale_amount?: string | number | null;
    currency?: string | null;
    unit_listing_price_cents?: number | null;
    listing_price_cents?: number | null;
    listing_platform?: string | null;
    account_source?: string | null;
  }
  rows = rows.map((row) => {
    const facts = row as PriceColumns;
    const price = resolveLinePrice({
      saleAmount:       facts.sale_amount ?? null,
      currency:         facts.currency ?? null,
      unitListingCents: facts.unit_listing_price_cents ?? null,
      listingCents:     facts.listing_price_cents ?? null,
      listingPlatform:  facts.listing_platform ?? null,
      orderPlatform:    facts.account_source ?? null,
    });
    const {
      listing_price_cents: _listingCents,
      listing_platform: _listingPlatform,
      unit_listing_price_cents: _unitListingCents,
      ...rest
    } = row;
    return {
      ...rest,
      price_cents:       price.cents,
      price_currency:    price.currency,
      price_is_estimate: price.isEstimate,
      // Provenance of the estimate: full shape only (no queue surface reads it).
      ...(q.queueShape ? {} : { price_source: price.source, price_platform: price.platform }),
    };
  });

  const payload: OrdersListPayload = {
    orders:     rows,
    count:      rows.length,
    nextCursor,
    truncated,
    weekStart:  weekStart || null,
    weekEnd:    weekEnd   || null,
  };

  if (!cacheable) return { payload, cache: 'BYPASS' };
  await deps.cacheSet(cacheLookup, payload);
  return { payload, cache: 'MISS' };
}
