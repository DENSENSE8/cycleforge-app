import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { tenantQuery } from '@/lib/tenancy/db';
import { createCacheLookupKey, getCachedJson, setCachedJson } from '@/lib/cache/upstash-cache';
import { normalizeTrackingKey18 } from '@/lib/tracking-format';
import { logRouteMetric } from '@/lib/route-metrics';
import { SHIPPED_BY_CARRIER_SQL } from '@/lib/sql-fragments';
import { SHIPMENT_STATUS_CATEGORIES } from '@/lib/order-lifecycle';
import { PACK_ACTIVITY_TYPES, sqlInList } from '@/lib/station-activity';
import {
  sqlOrderHasPackScan,
  sqlOrderHasShipConfirm,
  sqlOrderHasTechScan,
  sqlToShipDeskStage,
} from '@/lib/orders/order-grain-sql';
import { liveWorkingSetSql } from '@/lib/orders/exception-membership';
import { withAuth } from '@/lib/auth/withAuth';
import { WAREHOUSE_TIME_ZONE } from '@/utils/date';
import { parsePackedDateKey } from '@/lib/packed/packed-filters';

let replenishmentSchemaCheck:
  | { value: boolean; checkedAt: number }
  | null = null;

function isDatabaseUnavailable(error: unknown) {
  if (!(error instanceof Error)) return false;
  const causeMessage = typeof (error as { cause?: unknown }).cause === 'object'
    ? String(((error as { cause?: { message?: string } }).cause?.message) || '')
    : '';
  const message = `${error.message} ${causeMessage}`;
  return /ENOTFOUND|ECONNREFUSED|connect_timeout|connection terminated|timeout/i.test(message);
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

/**
 * GET /api/orders - Fetch all pending orders with optional filters.
 * Assignment info (tester_id / packer_id) is sourced from work_assignments.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const startedAt = Date.now();
  let ok = false;
  let cache = 'BYPASS';
  try {
    const { searchParams } = new URL(req.url);
    const orderIdRaw       = searchParams.get('orderId');
    const orderIdFilter =
      orderIdRaw != null && /^\d+$/.test(orderIdRaw.trim())
        ? Number(orderIdRaw.trim())
        : NaN;
    const singleOrderMode = Number.isFinite(orderIdFilter) && orderIdFilter > 0;
    const status             = searchParams.get('status');
    const assignedTo         = searchParams.get('assignedTo');
    const query              = searchParams.get('q') || '';
    const hasSearchQuery     = Boolean(String(query || '').trim());
    const weekStart          = searchParams.get('weekStart') || '';
    const weekEnd            = searchParams.get('weekEnd') || '';
    const packedDateFrom     = parsePackedDateKey(searchParams.get('dateFrom')) ?? '';
    const packedDateTo       = parsePackedDateKey(searchParams.get('dateTo')) ?? '';
    const assignmentStatus   = searchParams.get('assignmentStatus') || '';
    const shipByDate         = searchParams.get('shipByDate') || '';
    const packedBy           = searchParams.get('packedBy');
    const testedBy           = searchParams.get('testedBy');
    // Universal staff filter (P1-WORK-02): narrow the queue to one staff's
    // assigned work — packer OR tech assignee. Absent = ALL staff (default).
    const staffFilterRaw     = searchParams.get('staff');
    const staffFilterId      = staffFilterRaw && Number.isFinite(Number(staffFilterRaw)) && Number(staffFilterRaw) > 0
      ? Number(staffFilterRaw)
      : null;
    const includeShipped     = searchParams.get('includeShipped') === 'true';
    const shippedOnly        = searchParams.get('shippedOnly') === 'true';
    /** packedOnly=true  → only orders with a matching station_activity_logs row (packed & shipped view) */
    const packedOnly         = searchParams.get('packedOnly') === 'true';
    /** excludePacked=true → exclude orders with any station_activity_logs row (pending view) */
    const excludePacked      = searchParams.get('excludePacked') === 'true';
    /** awaitingOnly=true → only orders without shipment_id (Outbound Labels queue) */
    const awaitingOnly       = searchParams.get('awaitingOnly') === 'true';
    /**
     * fulfillmentScope=true → not-yet-packed fulfillment queue (legacy
     * Pending·Tested), including unlabeled (Needs label). Excludes PACK facts
     * and dock SHIP_CONFIRM — scan-out lives on the Shipped desk, never here.
     */
    const fulfillmentScope   = searchParams.get('fulfillmentScope') === 'true';
    /**
     * inWarehouse=true → labeled + tracked, still in the building (To-ship desk).
     * Union of pre-pack + packed-staged: no SHIP_CONFIRM / carrier leave.
     * Labels (awaitingOnly) and Scan-out history stay on their own routes.
     */
    const inWarehouse        = searchParams.get('inWarehouse') === 'true';
    /**
     * blockedOnly=true → out-of-stock work still in the building (Pending desk,
     * ex-Shortage).
     *
     * Deliberately NOT `inWarehouse` plus a flag. That scope requires a
     * shipment AND a tracking number, and an order is usually flagged out of
     * stock BEFORE anyone buys a label — so the desk whose entire job is the
     * blocked queue was asking for a set that structurally excludes most of it,
     * and painted whatever unrelated labeled row happened to remain (operator
     * 2026-09-04: "ensure that the out of stock will properly sort and display
     * under the pending tab"). Live working set, not yet scanned out, blocked:
     * that is the whole predicate, and the label question does not enter it.
     */
    const blockedOnly        = searchParams.get('blockedOnly') === 'true';
    /** stagedOnly=true → packed (PACK event) but not yet dock scan-out (no SHIP_CONFIRM) */
    const stagedOnly         = searchParams.get('stagedOnly') === 'true';
    /** exceptionsOnly=true → only orders whose shipment has an exception or has been stalled (no carrier scan in >stallHours, default 72h) */
    const exceptionsOnly     = searchParams.get('exceptions') === '1' || searchParams.get('exceptions') === 'true';
    const stallHoursRaw      = Number(searchParams.get('stallHours'));
    const stallHours         = Number.isFinite(stallHoursRaw) && stallHoursRaw > 0 && stallHoursRaw <= 720
      ? Math.floor(stallHoursRaw)
      : 72;
    /** carrier filter — restricts results to a single carrier via stn.carrier */
    const carrierRaw         = String(searchParams.get('carrier') || '').toUpperCase();
    const carrierFilter      = carrierRaw === 'UPS' || carrierRaw === 'USPS' || carrierRaw === 'FEDEX' ? carrierRaw : '';
    /** shipment status category filter — restricts to a single normalized category */
    const statusCategoryRaw  = String(searchParams.get('statusCategory') || '').toUpperCase();
    const statusCategoryFilter = (SHIPMENT_STATUS_CATEGORIES as readonly string[]).includes(statusCategoryRaw)
      ? statusCategoryRaw
      : '';
    const shippedByCarrierOrLatestStatusSql = SHIPPED_BY_CARRIER_SQL;

    // --- Unshipped queue (Phases 1-2): opt-in thin projection, coarse stage
    // filter, and keyset pagination. Every param below is ABSENT for all other
    // /api/orders callers, so their query + payload are byte-for-byte unchanged. ---
    const queueShape = searchParams.get('listShape') === 'queue' && !hasSearchQuery && !singleOrderMode;
    const stageRaw = String(searchParams.get('stage') || '').toLowerCase();
    const stageFilter =
      stageRaw === 'pending' || stageRaw === 'tested' || stageRaw === 'packed' ? stageRaw : '';
    const limitRaw = Number(searchParams.get('limit'));
    const pageLimit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 500) : null;
    // Keyset cursor over the ORDER BY.
    // Fulfillment (To Ship) is newest-first (`o.id DESC`) so manual add-order
    // and fresh imports paint at the head of Pending instead of under a
    // virtualized deadline-sorted backlog. Other `/api/orders` callers keep
    // `deadline_at ASC NULLS LAST, id ASC`.
    // Cursor payload stays base64(JSON{ d: iso|null, id }).
    const cursorRaw = searchParams.get('cursor');
    let cursor: { d: string | null; id: number } | null = null;
    if (cursorRaw) {
      try {
        const parsed = JSON.parse(Buffer.from(cursorRaw, 'base64').toString('utf8')) as { d?: unknown; id?: unknown };
        if (parsed && Number.isFinite(Number(parsed.id))) {
          cursor = { d: parsed.d == null ? null : String(parsed.d), id: Number(parsed.id) };
        }
      } catch { cursor = null; }
    }

    const cacheLookup = createCacheLookupKey({
      organizationId:     ctx.organizationId,
      status:             status || '',
      assignedTo:         assignedTo || '',
      query,
      weekStart,
      weekEnd,
      assignmentStatus,
      shipByDate,
      packedBy:           packedBy || '',
      testedBy:           testedBy || '',
      staffFilter:        staffFilterId ?? '',
      includeShipped,
      shippedOnly,
      packedOnly,
      excludePacked,
      awaitingOnly,
      fulfillmentScope,
      stagedOnly,
      packedDateFrom,
      packedDateTo,
      exceptionsOnly,
      stallHours,
      carrierFilter,
      statusCategoryFilter,
      listShape:          queueShape ? 'queue' : '',
      stage:              stageFilter,
      pageLimit:          pageLimit ?? '',
      cursor:             cursorRaw || '',
      inWarehouse,
      // Part of the cache identity, or the Pending desk and To-ship would share
      // one entry and serve each other's rows.
      blockedOnly,
      membershipVersion:  'pairing_exception_v1',
      shipmentStatusRuleVersion: 'latest_status_relaxed_v2',
    });

    const CACHE_HEADERS = { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=60' };

    if (!singleOrderMode && !hasSearchQuery) {
      const cached = await getCachedJson<any>('api:orders', cacheLookup);
      if (cached) {
        ok = true;
        cache = 'HIT';
        return NextResponse.json(cached, {
          headers: { 'x-cache': 'HIT', ...CACHE_HEADERS },
        });
      }
    }

    const hasReplenishment = await hasReplenishmentSchema();
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
    // listShape=queue omits the heavy per-order multi-tracking arrays (a
    // details-panel concern) — the row chip uses the single stn.tracking_number.
    // With those columns unreferenced, Postgres prunes the order_trackings LATERAL,
    // so this trims both the JSON payload and the per-row lateral scan.
    const trackingArraysSelect = queueShape
      ? `'[]'::json AS tracking_numbers,
        '[]'::json AS tracking_number_rows,`
      : `COALESCE(order_trackings.tracking_numbers, '[]'::json) AS tracking_numbers,
        COALESCE(order_trackings.tracking_number_rows, '[]'::json) AS tracking_number_rows,`;
    // Precompute latest assignment and shipment activity in set-based CTEs so the
    // orders query does not fan out into multiple per-row lateral scans.
    let sql = `
      WITH wa_deadline_ranked AS (
        SELECT
          wa.entity_id,
          wa.deadline_at,
          ROW_NUMBER() OVER (
            PARTITION BY wa.entity_id
            ORDER BY
              CASE wa.status
                WHEN 'IN_PROGRESS' THEN 1
                WHEN 'ASSIGNED' THEN 2
                WHEN 'OPEN' THEN 3
                WHEN 'DONE' THEN 4
                ELSE 5
              END,
              wa.updated_at DESC,
              wa.id DESC
          ) AS rn
        FROM work_assignments wa
        WHERE wa.entity_type = 'ORDER'
          AND wa.work_type = 'TEST'
      ),
      wa_deadline AS (
        SELECT entity_id, deadline_at
        FROM wa_deadline_ranked
        WHERE rn = 1
      ),
      wa_t_ranked AS (
        SELECT
          wa.entity_id,
          wa.assigned_tech_id,
          ROW_NUMBER() OVER (
            PARTITION BY wa.entity_id
            ORDER BY wa.updated_at DESC, wa.id DESC
          ) AS rn
        FROM work_assignments wa
        WHERE wa.entity_type = 'ORDER'
          AND wa.work_type = 'TEST'
          AND wa.assigned_tech_id IS NOT NULL
          AND wa.status <> 'CANCELED'
      ),
      wa_t AS (
        SELECT entity_id, assigned_tech_id
        FROM wa_t_ranked
        WHERE rn = 1
      ),
      wa_p_ranked AS (
        SELECT
          wa.entity_id,
          wa.assigned_packer_id,
          ROW_NUMBER() OVER (
            PARTITION BY wa.entity_id
            ORDER BY wa.updated_at DESC, wa.id DESC
          ) AS rn
        FROM work_assignments wa
        WHERE wa.entity_type = 'ORDER'
          AND wa.work_type = 'PACK'
          AND wa.assigned_packer_id IS NOT NULL
          AND wa.status <> 'CANCELED'
      ),
      wa_p AS (
        SELECT entity_id, assigned_packer_id
        FROM wa_p_ranked
        WHERE rn = 1
      ),
      pl_latest AS (
        SELECT DISTINCT ON (pl.shipment_id)
          pl.shipment_id,
          pl.id AS packer_log_id,
          pl.created_at AS packed_at,
          pl.packed_by
        FROM packer_logs pl
        WHERE pl.shipment_id IS NOT NULL
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
          AND sal.activity_type IN (${sqlInList(PACK_ACTIVITY_TYPES)})
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
         AND sal.activity_type IN (${sqlInList(PACK_ACTIVITY_TYPES)})
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
         AND sal.activity_type IN (${sqlInList(PACK_ACTIVITY_TYPES)})
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
      ${hasReplenishment ? `
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
      )` : `
      rr AS (
        SELECT
          NULL::integer AS order_id,
          NULL::uuid AS id,
          NULL::text AS status,
          NULL::numeric AS quantity_to_order,
          NULL::text AS zoho_po_number,
          NULL::text AS notes
        WHERE false
      )`}
      SELECT
        o.id,
        wa_deadline.deadline_at AS deadline_at,
        to_char(wa_deadline.deadline_at, 'YYYY-MM-DD') AS ship_by_date,
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
        o.shortage_coverage,
        o.status,
        o.notes,
        /*
         * Row flag + ops-note count. SECOND copy of this projection, because the
         * outbound queue has two independent order readers (this route and
         * lib/neon/orders-queries.ts ORDER_SERIALS_CTE) and a fact added to
         * one does not reach the others -- this is the live path the Pending
         * grid actually fetches. Scalar subqueries on o.id add nothing to
         * GROUP BY.
         *
         * It said THREE, naming getActiveOrders, which no longer exists
         * anywhere in src (measured 2026-09-02 while building the seller
         * field catalog). A stale count here is not cosmetic: it is the
         * constraint every new bindable fact is checked against, and checking
         * against a reader that is gone would let a one-sided fact through.
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
        ${replenishmentSelect}
        o.customer_id,
        stn.latest_status_code,
        stn.latest_status_label,
        stn.latest_status_description,
        stn.latest_status_category,
        stn.carrier,
        stn.latest_event_at::text AS latest_event_at,
        stn.has_exception,
        stn.exception_at::text AS exception_at,
        stn.is_terminal,
        ${shippedByCarrierOrLatestStatusSql} AS is_shipped,
        to_char(timezone('America/Los_Angeles', o.created_at), 'YYYY-MM-DD HH24:MI:SS') AS created_at,
        -- The CHANNEL's purchase instant. Distinct from created_at, which is
        -- when the row landed HERE: a backfilled or CSV-imported order has an
        -- import stamp and no order date at all, and the compound DATES cell
        -- says which of the two it is showing rather than passing one off as
        -- the other. Selected on BOTH order readers (see orders-queries.ts) --
        -- a fact on one reader is blank on the other lane with no error.
        to_char(timezone('America/Los_Angeles', o.order_date), 'YYYY-MM-DD HH24:MI:SS') AS order_date,
        o.tracking_added_at::text AS tracking_added_at,
        o.label_printed_at::text  AS label_printed_at,
        wa_t.assigned_tech_id   AS tester_id,
        wa_p.assigned_packer_id AS packer_id,
        pl_latest.packer_log_id,
        pl_latest.packed_at,
        COALESCE(pack_activity.staff_id, pl_latest.packed_by) AS packed_by,
        to_char(pack_activity.created_at, 'YYYY-MM-DD HH24:MI:SS') AS pack_activity_at,
        to_char(next_pack_activity.created_at, 'YYYY-MM-DD HH24:MI:SS') AS next_pack_activity_at,
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
        staff_pick_assignee.color_hex AS tester_color_hex,
        staff_pack_assignee.color_hex AS packer_color_hex,
        ${sqlOrderHasTechScan('o')} AS has_tech_scan,
        opp.location_id AS pack_location_id,
        COALESCE(NULLIF(BTRIM(loc_pack.display_name), ''), loc_pack.name) AS pack_location_name,
        loc_pack.location_kind AS pack_location_kind,
        o.sku_catalog_id,
        sc.image_url AS catalog_image_url,
        sc.category AS catalog_category
      FROM orders o
      LEFT JOIN sku_catalog sc ON sc.id = o.sku_catalog_id
      LEFT JOIN wa_deadline ON wa_deadline.entity_id = o.id
      LEFT JOIN wa_t ON wa_t.entity_id = o.id
      LEFT JOIN wa_p ON wa_p.entity_id = o.id
      LEFT JOIN pl_latest ON pl_latest.shipment_id = o.shipment_id
      LEFT JOIN pack_activity ON pack_activity.shipment_id = o.shipment_id
      LEFT JOIN next_pack_activity ON next_pack_activity.shipment_id = o.shipment_id
      LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
      LEFT JOIN order_pack_placements opp
        ON opp.order_id = o.id AND opp.organization_id = o.organization_id
      LEFT JOIN locations loc_pack ON loc_pack.id = opp.location_id
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
    `;
    const params: any[] = [];
    let paramCount = 1;

    sql += ` AND o.organization_id = $${paramCount++}`;
    params.push(ctx.organizationId);

    if (shippedOnly) {
      sql += ` AND ${shippedByCarrierOrLatestStatusSql}`;
    } else if (!includeShipped && !packedOnly) {
      // Pending/unshipped dashboards should stay limited to orders that have not
      // entered a carrier-shipped state, even when excludePacked is also active.
      sql += ` AND NOT ${shippedByCarrierOrLatestStatusSql}`;
      // Amazon-fulfilled (FBA/AFN) orders are read-only records — Amazon ships
      // them, so they never belong on the to-ship/pack to-do list.
      sql += ` AND COALESCE(o.fulfillment_channel, '') <> 'AFN'`;
      // Dock scan-out is the Shipped desk. Without this, never-packed rows that
      // already left still painted on To-ship / Ready-to-pack (fulfillmentScope
      // used to stop at "not packed").
      sql += ` AND NOT ${sqlOrderHasShipConfirm('o')}`;
    }

    if (packedOnly) {
      // CF-04: order-grain pack fact (not any SAL on the shared shipment).
      sql += ` AND ${sqlOrderHasPackScan('o')}`;
    } else if (excludePacked) {
      sql += ` AND NOT ${sqlOrderHasPackScan('o')}`;
    }

    if (awaitingOnly) {
      sql += ` AND o.shipment_id IS NULL`;
    }

    if (fulfillmentScope) {
      /*
       * Pre-pack board = every order that has not been packed yet, INCLUDING
       * the ones with no label (2026-08-30 operator ruling).
       *
       * This used to require `shipment_id IS NOT NULL` and a non-blank
       * tracking number, on the rule "blank tracking belongs on Labels". That
       * rule made needing a label a different TABLE instead of a different
       * STATE, and the cost was a queue that silently swallowed its own
       * intake: an order typed or synced without tracking vanished from the
       * desk with no count, no status and no way back to it. It is now a
       * lifecycle stage on this board — `resolveOrderLifecycleStage` returns
       * AWAITING_LABEL for `shipment_id IS NULL`, which the row paints as
       * "Needs label" beside Pending / Tested / Packed.
       *
       * A tracked-but-blank `tracking_number_raw` reads the same way: the
       * shipment row exists but carries no number, so the order still needs a
       * label and belongs in the same lane rather than nowhere.
       */
      // CF-04: exclude only when THIS order has a pack fact — not when a sibling
      // sharing the carton was packed (shipment-grain NOT EXISTS was the vanish bug).
      sql += ` AND NOT ${sqlOrderHasPackScan('o')}`;
      // Exception-held stays out of the live working set (R-FLOW-7): caged
      // AND unpaired. Pairing lands the order on this board even when manuals
      // or a shipping label are still missing — those are paperwork, not
      // another table. NULL release_state = released (legacy rows).
      sql += ` AND ${liveWorkingSetSql('o')}`;
      sql += ` AND NOT ${sqlOrderHasShipConfirm('o')}`;
    }

    if (inWarehouse) {
      sql += ` AND o.shipment_id IS NOT NULL`;
      sql += ` AND COALESCE(TRIM(stn.tracking_number_raw), '') <> ''`;
      // Same exception-held predicate as fulfillmentScope — the To-ship desk's
      // in-building set is live work; unpaired+caged is by definition not.
      sql += ` AND ${liveWorkingSetSql('o')}`;
      sql += ` AND NOT ${sqlOrderHasShipConfirm('o')}`;
    }

    if (blockedOnly) {
      sql += ` AND o.is_out_of_stock IS TRUE`;
      // Same live-work membership the To-ship scope uses — an unpaired / caged
      // order is not floor work, blocked or not.
      sql += ` AND ${liveWorkingSetSql('o')}`;
      sql += ` AND NOT ${sqlOrderHasShipConfirm('o')}`;
      sql += ` AND NOT ${shippedByCarrierOrLatestStatusSql}`;
      // Packed OOS is Scan-out's problem. Without this, a 200-row page could
      // be mostly packed rows the client then dropped, so the Pending tab
      // under-filled and "Load more" used the wrong remaining set.
      sql += ` AND NOT ${sqlOrderHasPackScan('o')}`;
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
        const packedDaySql = `timezone('${WAREHOUSE_TIME_ZONE}', COALESCE(pl_latest.packed_at, pack_activity.created_at))::date`;
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
    // Pending = PENDING + BLOCKED (out of stock), matching the tab count.
    // `packed` is only meaningful under inWarehouse (packed-staged still here).
    if (stageFilter === 'tested' || stageFilter === 'pending' || stageFilter === 'packed') {
      sql += ` AND ${sqlToShipDeskStage('o', stageFilter)}`;
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
      sql += ` AND wa_p.assigned_packer_id = $${paramCount++}`;
      params.push(Number(assignedTo));
    }

    if (packedBy) {
      sql += ` AND wa_p.assigned_packer_id = $${paramCount++}`;
      params.push(Number(packedBy));
    }

    if (testedBy) {
      sql += ` AND wa_t.assigned_tech_id = $${paramCount++}`;
      params.push(Number(testedBy));
    }

    if (staffFilterId != null) {
      // Match queue-counts: ANY non-canceled pack/test assignment to this staff,
      // not just the latest ranked wa_p/wa_t row (reassignments must not hide work).
      sql += ` AND EXISTS (
        SELECT 1 FROM work_assignments wa
        WHERE wa.entity_type = 'ORDER' AND wa.entity_id = o.id
          AND wa.status <> 'CANCELED'
          AND (wa.assigned_packer_id = $${paramCount} OR wa.assigned_tech_id = $${paramCount})
      )`;
      params.push(staffFilterId);
      paramCount++;
    }

    if (assignmentStatus === 'unassigned') {
      sql += `
        AND NOT EXISTS (
          SELECT 1 FROM work_assignments wa
          WHERE wa.entity_type = 'ORDER' AND wa.entity_id = o.id
            AND wa.status IN ('ASSIGNED', 'IN_PROGRESS')
        )`;
    } else if (assignmentStatus === 'assigned') {
      sql += `
        AND EXISTS (
          SELECT 1 FROM work_assignments wa
          WHERE wa.entity_type = 'ORDER' AND wa.entity_id = o.id
            AND wa.status IN ('ASSIGNED', 'IN_PROGRESS')
        )`;
    }

    if (shipByDate) {
      sql += ` AND COALESCE(wa_deadline.deadline_at::date, o.created_at::date) = $${paramCount++}`;
      params.push(shipByDate);
    } else {
      if (weekStart) {
        sql += ` AND COALESCE(wa_deadline.deadline_at::date, o.created_at::date) >= $${paramCount++}`;
        params.push(weekStart);
      }
      if (weekEnd) {
        sql += ` AND COALESCE(wa_deadline.deadline_at::date, o.created_at::date) <= $${paramCount++}`;
        params.push(weekEnd);
      }
    }

    const trimmedQuery = query.trim();
    const normalizedDigits = trimmedQuery.replace(/\D/g, '');
    const last8 = normalizedDigits.length >= 8 ? normalizedDigits.slice(-8) : '';
    const key18 = normalizeTrackingKey18(trimmedQuery);

    if (trimmedQuery) {
      const likeValue = `%${trimmedQuery}%`;
      sql += ` AND (
        o.product_title ILIKE $${paramCount}
        OR COALESCE(o.sku, '') ILIKE $${paramCount}
        OR COALESCE(o.order_id, '') ILIKE $${paramCount}
        OR COALESCE(o.item_number, '') ILIKE $${paramCount}
        OR COALESCE(stn.tracking_number_raw, '') ILIKE $${paramCount}
        OR COALESCE(o.status, '') ILIKE $${paramCount}
        OR COALESCE(o.notes, '') ILIKE $${paramCount}
        OR COALESCE(o.account_source, '') ILIKE $${paramCount}
        OR COALESCE(o.quantity, '') ILIKE $${paramCount}
        OR COALESCE(o.customer_id::text, '') ILIKE $${paramCount}
        OR o.id::text ILIKE $${paramCount}
      `;
      params.push(likeValue);
      paramCount++;

      if (last8) {
        sql += ` OR RIGHT(regexp_replace(COALESCE(o.order_id, ''), '[^0-9]', '', 'g'), 8) = $${paramCount}
          OR RIGHT(regexp_replace(UPPER(COALESCE(stn.tracking_number_normalized, '')), '[^A-Z0-9]', '', 'g'), 8) = $${paramCount}`;
        params.push(last8);
        paramCount++;
      }

      if (key18) {
        sql += ` OR o.shipment_id IN (
          SELECT s.id FROM shipping_tracking_numbers s
          WHERE RIGHT(regexp_replace(UPPER(COALESCE(s.tracking_number_normalized, '')), '[^A-Z0-9]', '', 'g'), 18) = $${paramCount}
        )`;
        params.push(key18);
        paramCount++;
      }

      if (/^\d+$/.test(trimmedQuery) && trimmedQuery.length <= 10) {
        sql += ` OR o.id = $${paramCount}
          OR COALESCE(o.customer_id, -1) = $${paramCount}`;
        params.push(Number(trimmedQuery));
        paramCount++;
      }

      sql += `)`;
    }

    if (singleOrderMode) {
      sql += ` AND o.id = $${paramCount++}`;
      params.push(orderIdFilter);
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

    sql += fulfillmentScope
      ? ` ORDER BY o.id DESC`
      : ` ORDER BY wa_deadline.deadline_at ASC NULLS LAST, o.id ASC`;

    // Fetch one extra row to detect truncation + mint the next keyset cursor.
    // Only when an explicit limit is set — unlimited callers are unchanged.
    if (pageLimit != null) {
      sql += ` LIMIT $${paramCount++}`;
      params.push(pageLimit + 1);
    }

    const result = await tenantQuery(ctx.organizationId, sql, params);

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
      nextCursor = Buffer.from(JSON.stringify({ d, id: Number(last?.id) }), 'utf8').toString('base64');
    }

    const payload = {
      orders:     rows,
      count:      rows.length,
      nextCursor,
      truncated,
      weekStart:  weekStart || null,
      weekEnd:    weekEnd   || null,
    };
    if (!singleOrderMode && !hasSearchQuery) {
      await setCachedJson('api:orders', cacheLookup, payload, 300, ['orders']);
      cache = 'MISS';
    } else {
      cache = 'BYPASS';
    }
    ok = true;
    return NextResponse.json(payload, {
      headers: {
        'x-cache': singleOrderMode || hasSearchQuery ? 'BYPASS' : 'MISS',
        ...CACHE_HEADERS,
      },
    });
  } catch (error: any) {
    console.error('Error in GET /api/orders:', error);
    if (isDatabaseUnavailable(error)) {
      return NextResponse.json(
        { orders: [], count: 0, weekStart: null, weekEnd: null, dbUnavailable: true },
        { headers: { 'x-db-fallback': 'unavailable' } }
      );
    }
    return NextResponse.json(
      { error: 'Failed to fetch orders', details: error.message },
      { status: 500 }
    );
  } finally {
    logRouteMetric({
      route: '/api/orders',
      method: 'GET',
      startedAt,
      ok,
      details: { cache },
    });
  }
}, { permission: 'orders.view' });
