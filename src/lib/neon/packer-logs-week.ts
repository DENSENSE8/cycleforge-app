import { after } from 'next/server';
import type { QueryResult } from 'pg';
import pool from '@/lib/db';
import {
  createCacheLookupKey,
  getCachedJson,
  setCachedJson,
} from '@/lib/cache/upstash-cache';
import { getCurrentPSTDateKey } from '@/utils/date';
import { escapeLike } from '@/lib/sql-like';
import { queryWithRetry } from '@/lib/db-retry';
import { isPackerLogEnrichmentRead } from '@/lib/feature-flags';
import { sqlPackerOrderMatchLateral } from '@/lib/neon/packer-order-match';
import { computePackerLogEnrichment } from '@/lib/neon/packer-log-enrichment';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  NO_SHIPPED_DESK_FILTERS,
  hasShippedDeskFilter,
  shippedDeskConditions,
  shippedFilterJoins,
  type ShippedDeskFilters,
} from '@/lib/shipping/shipped-filter/shipped-filter-sql';
import { sqlOrderPickedByStaff } from '@/lib/orders/desk-view-sql';
import { orderLineImageSql } from '@/lib/photos/order-line-image-sql';

interface FetchPackerLogRowsOptions {
  /**
   * Tenant scope (REQUIRED). Every row is filtered by `sal.organization_id`
   * and the org id is part of the cache key — without it this loader returned
   * every tenant's PACK rows to any caller (tenant-isolation bug, 2026-07-01).
   */
  organizationId: OrgId;
  packerId?: number | null;
  /**
   * Universal staff filter (P1-WORK-02): narrow to rows this staff packed OR
   * tested. Null/absent = ALL staff (default). Independent of packerId.
   */
  staffId?: number | null;
  limit?: number;
  offset?: number;
  weekStart?: string;
  weekEnd?: string;
  /** Exact shipped-instant window — see {@link PackerLogBaseFilter.shippedFrom}. */
  shippedFrom?: string | null;
  shippedTo?: string | null;
  /** `?pickedBy` — see {@link PackerLogBaseFilter.pickedBy}. */
  pickedBy?: number | null;
  /**
   * The Shipped desk's view filters (type / carrier / status / exceptions),
   * answered in the page WHERE — one predicate with the sidebar facet counts.
   * Absent = no such narrowing (packer station, recents, review).
   */
  shippedFilters?: ShippedDeskFilters;
  /** The bench find box, ANSWERED HERE. */
  searchTerm?: string;
  /** Spine-first render (immediate paint). */
  spineOnly?: boolean;
  /** Sidebar sort. Default is scanned-out, newest. */
  sort?: string | null;
}

interface FetchPackerLogRowsResult {
  rows: any[];
  cacheTTL: number;
  cacheHit: boolean;
}

// v9: rows carry the PACKAGE (`package_shipment_id` / `package_tracking` /
// `package_line_count`), and scan-out-only packages join the feed.
// v10: the Shipped desk's type / carrier / status / exceptions filters are
// answered here (they were a browser pass over the page), so a filtered page
// is a different answer than v9's.
// v11: rows carry the package's order lines (`package_lines`) — the Shipped
// card's lines, read with the same title / photo joins as the package record.
// v12: a line's photo is the Allocate precedence (`orderLineImageSql`), not the catalog image alone.
// v14: staff filter includes the latest SHIP_CONFIRM staffer, not only pack and test.
// v17: staff 1 scan-out timestamps were moved onto the pack instant; drop the v16 page.
const CACHE_NAMESPACE = 'api:packing-logs-v17';
const CACHE_TAGS = ['packing-logs'];

/** Sidebar sort → the page CTE's ORDER BY. Default is scanned-out, newest. */
function shippedPageOrderSql(sort: string | null | undefined): string {
  const scanned = 'COALESCE(ship_page.ship_confirmed_at, sal.created_at)';
  const severity = `CASE UPPER(COALESCE(stn_sort.latest_status_category, ''))
    WHEN 'EXCEPTION' THEN 1
    WHEN 'RETURNED' THEN 2
    WHEN 'OUT_FOR_DELIVERY' THEN 3
    WHEN 'IN_TRANSIT' THEN 4
    WHEN 'ACCEPTED' THEN 5
    WHEN 'LABEL_CREATED' THEN 6
    WHEN 'DELIVERED' THEN 7
    ELSE 8 END`;
  switch (sort) {
    case 'ship_confirmed_at_asc':
      return `${scanned} ASC NULLS LAST, sal.id ASC`;
    case 'delivered_at':
      return `stn_sort.delivered_at DESC NULLS LAST, ${scanned} DESC, sal.id DESC`;
    case 'status':
      return `${severity} ASC, ${scanned} DESC, sal.id DESC`;
    case 'sale_amount':
      return `(SELECT o_amt.sale_amount FROM orders o_amt WHERE o_amt.organization_id = sal.organization_id AND o_amt.shipment_id = sal.shipment_id ORDER BY o_amt.id LIMIT 1) DESC NULLS LAST, ${scanned} DESC, sal.id DESC`;
    default:
      return `${scanned} DESC NULLS LAST, sal.id DESC`;
  }
}

// Hard ceiling for a SEARCHING read — the page bound `searchTerm` replaces.
const SEARCH_ROW_CEILING = 5000;

// Set once if `packer_log_enrichment` is absent (a DB that hasn't run the 2026-06-29f migration — e.g.
let enrichmentTableMissing = false;

export interface PackerLogBaseFilter {
  organizationId: OrgId;
  packerId?: number | null;
  staffId?: number | null;
  weekStart?: string;
  weekEnd?: string;
  /**
   * Exact shipped-instant window (`?timeFrom`/`?timeTo` over `dateFrom`/`dateTo`,
   * see `readShippedTimeWindow`): `sal.created_at` in `[shippedFrom, shippedTo)`.
   * Both or neither; intersects the (padded) week window.
   */
  shippedFrom?: string | null;
  shippedTo?: string | null;
  /** `?pickedBy` — the order's picker (PICK_FACTS_LATERALS source priority). */
  pickedBy?: number | null;
}

/**
 * The order that owns a scan-out row's package: an ORDER shipment_link, else the
 * order whose own shipment it is — two index probes. Scan-out-only rows have no
 * enrichment (the projection is PACK-only) but always a package, so the enriched
 * read resolves them here, not through the key18 order-match arm. The guard sits
 * in each arm so PACK rows skip the probes.
 */
const PACKAGE_OWNER_LATERAL = `LEFT JOIN LATERAL (
        SELECT owner.id
        FROM (
            SELECT sl_own.owner_id AS id, 0 AS rank, COALESCE(sl_own.is_primary, false) AS is_primary
            FROM shipment_links sl_own
            WHERE sal.station <> 'PACK'
              AND sl_own.owner_type = 'ORDER'
              AND sl_own.shipment_id = sal.shipment_id
              AND sl_own.organization_id = sal.organization_id
            UNION ALL
            SELECT o_own.id, 1, true
            FROM orders o_own
            WHERE sal.station <> 'PACK'
              AND o_own.shipment_id = sal.shipment_id
              AND o_own.organization_id = sal.organization_id
        ) owner
        ORDER BY owner.rank, owner.is_primary DESC, owner.id DESC
        LIMIT 1
    ) package_owner ON TRUE`;

/**
 * Page-selection joins a staff / pickedBy filter reads: the row's order and its
 * test laterals. On the enriched read path the order resolves exactly as the
 * enriched list query projects it — `packer_log_enrichment.order_row_id`, the
 * live order match only for a PACK scan not yet enriched, and the package owner
 * for a scan-out row — so the filter tests the order the row displays. Before
 * this, an all-dates staff / picker filter ran the three-arm order match for
 * every row in the tenant (~9 s at 43.7k rows).
 */
export function packerLogOrderJoins(enriched: boolean): string {
  const orderJoin = enriched
    ? `
        LEFT JOIN packer_log_enrichment enr_o ON enr_o.sal_id = sal.id
        ${sqlPackerOrderMatchLateral('order_match', "enr_o.sal_id IS NULL AND sal.station = 'PACK'")} ON TRUE
        ${PACKAGE_OWNER_LATERAL}
        LEFT JOIN orders o ON o.id = COALESCE(enr_o.order_row_id, order_match.id, package_owner.id)
          AND o.organization_id = sal.organization_id`
    : `
        ${sqlPackerOrderMatchLateral('order_match')} ON TRUE
        LEFT JOIN orders o ON o.id = order_match.id AND o.organization_id = sal.organization_id`;
  return `
        LEFT JOIN shipping_tracking_numbers stn ON stn.id = sal.shipment_id${orderJoin}
        LEFT JOIN LATERAL (
            SELECT MIN(tsn.tested_by)::int AS tested_by
            FROM tech_serial_numbers tsn
            WHERE tsn.organization_id = o.organization_id
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
        ) test_data ON TRUE`;
}

/**
 * Latest staffed dock handoff for the represented shipment. The fallback keeps
 * this shared SQL safe for a non-Shipped consumer even though current callers
 * also apply the staffed SHIP_CONFIRM membership predicate below.
 */
export function sqlLatestShipConfirmAt(alias = 'sal'): string {
  return `COALESCE((
      SELECT so_at.created_at
      FROM station_activity_logs so_at
      WHERE so_at.organization_id = ${alias}.organization_id
        AND so_at.shipment_id = ${alias}.shipment_id
        AND so_at.activity_type = 'SHIP_CONFIRM'
        AND so_at.staff_id IS NOT NULL
        AND so_at.staff_id > 0
      ORDER BY so_at.created_at DESC, so_at.id DESC
      LIMIT 1
    ), ${alias}.created_at)`;
}

/** Latest staffed dock handoff's staffer. Same row as {@link sqlLatestShipConfirmAt}. */
export function sqlLatestShipConfirmStaff(alias = 'sal'): string {
  return `(
      SELECT so_at.staff_id
      FROM station_activity_logs so_at
      WHERE so_at.organization_id = ${alias}.organization_id
        AND so_at.shipment_id = ${alias}.shipment_id
        AND so_at.activity_type = 'SHIP_CONFIRM'
        AND so_at.staff_id IS NOT NULL
        AND so_at.staff_id > 0
      ORDER BY so_at.created_at DESC, so_at.id DESC
      LIMIT 1
    )`;
}
/**
 * The packer-log population every read shares — tenant, row population, the
 * Shipped-desk membership (a dock scan-out), staff and the padded date window —
 * over `station_activity_logs sal` + `packer_logs pl`. Appends its bind values
 * to `params`. `needsOrderJoins` = the query must add {@link packerLogOrderJoins}.
 */
export function buildPackerLogBaseWhere(
  opts: PackerLogBaseFilter,
  params: unknown[],
): { conditions: string[]; needsOrderJoins: boolean } {
  const orgId = opts.organizationId;
  const weekStart = opts.weekStart ?? '';
  const weekEnd = opts.weekEnd ?? '';
  const staffFilterId =
    opts.staffId != null && Number.isFinite(opts.staffId) && opts.staffId > 0 ? opts.staffId : null;
  const conditions: string[] = [];

  params.push(orgId);
  conditions.push(`sal.organization_id = $${params.length}`);

  // Row population:
  conditions.push(`(
    sal.station = 'PACK'
    OR (
      sal.activity_type = 'SHIP_CONFIRM'
      AND sal.shipment_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM station_activity_logs pk
        WHERE pk.shipment_id = sal.shipment_id
          AND pk.organization_id = sal.organization_id
          AND pk.station = 'PACK'
      )
      AND NOT EXISTS (
        SELECT 1 FROM station_activity_logs so_newer
        WHERE so_newer.shipment_id = sal.shipment_id
          AND so_newer.organization_id = sal.organization_id
          AND so_newer.activity_type = 'SHIP_CONFIRM'
          AND (so_newer.created_at, so_newer.id) > (sal.created_at, sal.id)
      )
    )
  )`);

  // Shipped desk membership: a dock scan-out with staff + time. Packed-only
  // (IN STAGING) stays on To-ship until SHIP_CONFIRM.
  conditions.push(`EXISTS (
    SELECT 1 FROM station_activity_logs so
    WHERE so.activity_type = 'SHIP_CONFIRM'
      AND so.staff_id IS NOT NULL
      AND so.staff_id > 0
      AND so.shipment_id IS NOT NULL
      AND so.shipment_id = sal.shipment_id
      AND so.organization_id = sal.organization_id
  )`);

  if (opts.packerId != null && !Number.isNaN(opts.packerId)) {
    params.push(opts.packerId);
    conditions.push(`(sal.station = 'PACK' AND sal.staff_id = $${params.length})`);
  }

  // Staff on this desk: who scanned it out, or packed it, or tested it.
  // Scan-out staff is the dock handoff. Packed-only missed 1231 of staff 1's
  // Sep 30 drop-offs.
  if (staffFilterId != null) {
    params.push(staffFilterId);
    const staffIdx = params.length;
    conditions.push(
      `((sal.station = 'PACK' AND sal.staff_id = $${staffIdx})`
      + ` OR test_data.tested_by = $${staffIdx}`
      + ` OR ${sqlLatestShipConfirmStaff()} = $${staffIdx})`,
    );
  }

  // A Shipped period is the dock handoff period, not the earlier pack-scan
  // period. Keep the one-day padding used by the client-side PST boundary pass.
  if (weekStart && weekEnd) {
    params.push(weekStart, weekEnd);
    const ws = params.length - 1;
    const we = params.length;
    conditions.push(`${sqlLatestShipConfirmAt()} >= ($${ws}::date - interval '1 day')`);
    conditions.push(`${sqlLatestShipConfirmAt()} <  ($${we}::date + interval '2 days')`);
  }

  if (opts.shippedFrom && opts.shippedTo) {
    params.push(opts.shippedFrom, opts.shippedTo);
    conditions.push(`${sqlLatestShipConfirmAt()} >= $${params.length - 1}::timestamptz`);
    conditions.push(`${sqlLatestShipConfirmAt()} <  $${params.length}::timestamptz`);
  }

  const pickedBy =
    opts.pickedBy != null && Number.isSafeInteger(opts.pickedBy) && opts.pickedBy > 0 ? opts.pickedBy : null;
  if (pickedBy != null) {
    params.push(pickedBy);
    conditions.push(sqlOrderPickedByStaff('o', `$${params.length}`));
  }

  return {
    conditions,
    needsOrderJoins: staffFilterId != null || pickedBy != null,
  };
}

/**
 * The Shipped find box (`/api/packerlogs?q=`) as one predicate over
 * `station_activity_logs sal`; `likeParam` binds `%<escapeLike(term)>%`.
 */
export function sqlPackerLogSearch(likeParam: string): string {
  if (!/^\$[1-9][0-9]*$/.test(likeParam)) throw new Error(`invalid SQL param ref: ${likeParam}`);
  const q = likeParam;
  const orderMatchesQ = (o: string) =>
    `${o}.order_id ILIKE ${q} OR ${o}.product_title ILIKE ${q} OR ${o}.sku ILIKE ${q}`
    + ` OR ${o}.item_number ILIKE ${q} OR ${o}.notes ILIKE ${q}`;
  return `(
        sal.scan_ref ILIKE ${q}
        OR sal.fnsku ILIKE ${q}
        OR EXISTS (
            SELECT 1 FROM shipping_tracking_numbers stn_q
            WHERE stn_q.id = sal.shipment_id
              AND stn_q.tracking_number_raw ILIKE ${q}
        )
        OR EXISTS (
            SELECT 1 FROM staff packed_staff_q
            WHERE packed_staff_q.id = sal.staff_id
              AND packed_staff_q.organization_id = sal.organization_id
              AND packed_staff_q.name ILIKE ${q}
        )
        OR EXISTS (
            SELECT 1 FROM fba_fnskus ff_q
            WHERE ff_q.fnsku = sal.fnsku
              AND ff_q.organization_id = sal.organization_id
              AND (ff_q.product_title ILIKE ${q} OR ff_q.sku ILIKE ${q})
        )
        OR EXISTS (
            SELECT 1 FROM orders o_q
            WHERE sal.shipment_id IS NOT NULL
              AND o_q.shipment_id = sal.shipment_id
              AND o_q.organization_id = sal.organization_id
              AND (${orderMatchesQ('o_q')})
        )
        OR EXISTS (
            SELECT 1 FROM shipment_links osl_q
            JOIN orders o_q ON o_q.id = osl_q.owner_id AND o_q.organization_id = sal.organization_id
            WHERE sal.shipment_id IS NOT NULL
              AND osl_q.owner_type = 'ORDER'
              AND osl_q.shipment_id = sal.shipment_id
              AND (${orderMatchesQ('o_q')})
        )
        OR EXISTS (
            SELECT 1 FROM tech_serial_numbers tsn_q
            LEFT JOIN staff tester_q ON tester_q.id = tsn_q.tested_by
            WHERE sal.shipment_id IS NOT NULL
              AND tsn_q.organization_id = sal.organization_id
              AND tsn_q.shipment_id = sal.shipment_id
              AND (tsn_q.serial_number ILIKE ${q} OR tester_q.name ILIKE ${q})
        )
    )`;
}

/** Shared loader for the /tech packer-logs week query. */
export async function fetchPackerLogRows(
  opts: FetchPackerLogRowsOptions,
): Promise<FetchPackerLogRowsResult> {
  const searchTerm = (opts.searchTerm ?? '').trim();
  /** A searching read drops the page bound and covers the whole week. */
  const limit = searchTerm ? SEARCH_ROW_CEILING : (opts.limit ?? 500);
  const offset = searchTerm ? 0 : (opts.offset ?? 0);
  const weekStart = opts.weekStart ?? '';
  const weekEnd = opts.weekEnd ?? '';
  // Spine-first only makes sense on the enriched read path (it trims enriched
  // laterals); the legacy query is left whole.
  const spineOnly = Boolean(opts.spineOnly) && isPackerLogEnrichmentRead();

  const orgId = opts.organizationId;

  const staffFilterId =
    opts.staffId != null && Number.isFinite(opts.staffId) && opts.staffId > 0 ? opts.staffId : null;

  const cacheLookup = createCacheLookupKey({
    // Org id FIRST so the cache is per-tenant — never share a PACK-log page
    // across organizations.
    organizationId: orgId,
    packerId: opts.packerId ?? '',
    staffId: staffFilterId ?? '',
    limit,
    offset,
    weekStart,
    weekEnd,
    shippedFilters: [
      opts.shippedFilters?.type ?? '',
      opts.shippedFilters?.carrier ?? '',
      opts.shippedFilters?.statusCategory ?? '',
      opts.shippedFilters?.exceptionsOnly ? 'exceptions' : '',
      (opts.shippedFilters?.channels ?? []).join(','),
    ].join('|'),
    // Exact shipped-instant window + picker — each narrows the answer.
    shippedWindow: opts.shippedFrom && opts.shippedTo ? `${opts.shippedFrom}|${opts.shippedTo}` : '',
    pickedBy: opts.pickedBy ?? '',
    // The query text is part of the ANSWER, so it belongs in the key — without
    // it a searched page and the unfiltered week collide on one entry and the
    // first to land is served to the other.
    q: searchTerm,
    // Spine and full responses have different column payloads — keep them in
    // separate cache entries so one can never be served for the other.
    phase: spineOnly ? 'spine' : 'full',
    sort: opts.sort ?? '',
  });

  const today = getCurrentPSTDateKey();
  const cacheTTL = weekEnd && weekEnd < today ? 86400 : 120;

  const cached = await getCachedJson<any[]>(CACHE_NAMESPACE, orgId, cacheLookup);
  if (cached) {
    return { rows: cached, cacheTTL, cacheHit: true };
  }

  const params: unknown[] = [];
  const { conditions, needsOrderJoins } = buildPackerLogBaseWhere(opts, params);

  /** The find box, as SQL — and it joins `conditions`, which is the PAGE CTE's WHERE, above the LIMIT. */
  if (searchTerm) {
    params.push(`%${escapeLike(searchTerm)}%`);
    conditions.push(sqlPackerLogSearch(`$${params.length}`));
  }

  // The Shipped desk's view filters. Both read paths bind the same values; only
  // the order-match fragment differs, so each gets its own WHERE over one list.
  const shippedFilters = opts.shippedFilters ?? NO_SHIPPED_DESK_FILTERS;
  const boundShipped = new Map<unknown, string>();
  const bindShipped = (value: unknown) => {
    let placeholder = boundShipped.get(value);
    if (!placeholder) {
      params.push(value);
      placeholder = `$${params.length}`;
      boundShipped.set(value, placeholder);
    }
    return placeholder;
  };
  const whereFor = (enriched: boolean) =>
    `WHERE ${[...conditions, ...shippedDeskConditions(shippedFilters, enriched, bindShipped)].join(' AND ')}`;
  const legacyWhere = whereFor(false);
  const enrichedWhere = whereFor(true);
  params.push(limit, offset);
  const limitIdx = params.length - 1;
  const offsetIdx = params.length;

  // Page-selection joins. Almost every filter touches only sal/pl, but a
  // staff / pickedBy filter references the order-derived laterals, and a
  // Shipped desk filter reads the package — pulled in only when active.
  const shippedJoins = hasShippedDeskFilter(shippedFilters);

  // The PACKAGE a row is about, and its order lines (lowest `orders.id` first —
  // the record's primary line) with the SKU identity title / photo sources the
  // package record reads (`loadShipmentRecordRows`), so card and record agree.
  const packageCols = `sal.shipment_id::int                   AS package_shipment_id,
        stn.tracking_number_raw                AS package_tracking,
        package_lines.line_count               AS package_line_count,
        package_lines.lines                    AS package_lines`;
  const packageLinesJoin = `LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS line_count,
               json_agg(json_build_object(
                   'id', o_pk.id,
                   'order_id', o_pk.order_id,
                   'account_source', o_pk.account_source,
                   'sku', o_pk.sku,
                   'product_title', o_pk.product_title,
                   'zoho_item_title', cxi_pk.external_name,
                   'catalog_product_title', sc_pk.product_title,
                   'quantity', o_pk.quantity,
                   'condition', o_pk.condition,
                   'sale_amount', o_pk.sale_amount,
                   'currency', o_pk.currency,
                   'catalog_image_url', ${orderLineImageSql('o_pk')}
               ) ORDER BY o_pk.id) AS lines
        FROM (
            SELECT o_pk.id
            FROM orders o_pk
            WHERE o_pk.shipment_id = sal.shipment_id
              AND o_pk.organization_id = sal.organization_id
            UNION
            SELECT o_pk.id
            FROM shipment_links sl_pk
            JOIN orders o_pk ON o_pk.id = sl_pk.owner_id AND o_pk.organization_id = sl_pk.organization_id
            WHERE sl_pk.owner_type = 'ORDER'
              AND sl_pk.shipment_id = sal.shipment_id
              AND sl_pk.organization_id = sal.organization_id
        ) pk_lines
        JOIN orders o_pk ON o_pk.id = pk_lines.id
        LEFT JOIN sku_catalog sc_pk ON sc_pk.sku = o_pk.sku AND sc_pk.organization_id = o_pk.organization_id
        LEFT JOIN LATERAL (
            SELECT x.external_name
            FROM catalog_external_ids x
            WHERE x.sku_catalog_id = sc_pk.id
              AND x.organization_id = o_pk.organization_id
              AND x.provider = 'zoho'
            ORDER BY x.id
            LIMIT 1
        ) cxi_pk ON TRUE
    ) package_lines ON sal.shipment_id IS NOT NULL`;

  // Resolve the page before the expensive per-row product-title / serial /
  // order-match laterals run. Compute the latest handoff once per shipment so
  // ordering does not execute a correlated aggregate for every candidate row.
  const pageOrder = shippedPageOrderSql(opts.sort);
  const pageCteFor = (enriched: boolean) => `
    WITH latest_ship_confirm AS MATERIALIZED (
        SELECT DISTINCT ON (so_page.shipment_id)
               so_page.shipment_id,
               so_page.created_at AS ship_confirmed_at,
               so_page.staff_id AS shipped_out_by
        FROM station_activity_logs so_page
        WHERE so_page.organization_id = $1
          AND so_page.activity_type = 'SHIP_CONFIRM'
          AND so_page.staff_id IS NOT NULL
          AND so_page.staff_id > 0
          AND so_page.shipment_id IS NOT NULL
        ORDER BY so_page.shipment_id, so_page.created_at DESC, so_page.id DESC
    ),
    page AS MATERIALIZED (
        SELECT sal.id, row_number() OVER (ORDER BY ${pageOrder}) AS ord
        FROM station_activity_logs sal
        LEFT JOIN latest_ship_confirm ship_page ON ship_page.shipment_id = sal.shipment_id
        LEFT JOIN shipping_tracking_numbers stn_sort ON stn_sort.id = sal.shipment_id
        LEFT JOIN packer_logs pl ON pl.id = sal.packer_log_id${needsOrderJoins || shippedFilters.channels.length > 0 ? packerLogOrderJoins(enriched) : ''}${shippedJoins ? shippedFilterJoins(enriched) : ''}
        ${enriched ? enrichedWhere : legacyWhere}
        ORDER BY ${pageOrder}
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
    )`;

  const legacyQuery = `
    ${pageCteFor(false)}
    SELECT
        sal.id,
        sal.packer_log_id AS packer_log_id,
        to_char(sal.created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at,
        sal.scan_ref,
        COALESCE(stn.tracking_number_raw, oe.shipping_tracking_number, sal.scan_ref, sal.fnsku) AS shipping_tracking_number,
        oe.id AS orders_exception_id,
        oe.exception_reason,
        oe.status AS exception_status,
        CASE WHEN oe.id IS NOT NULL AND o.id IS NULL THEN 'exception' ELSE 'order' END AS row_source,
        CASE WHEN sal.station = 'PACK' THEN sal.staff_id END AS packed_by,
        packed_staff.name AS packed_by_name,
        COALESCE(pl.tracking_type,
                 CASE sal.activity_type
                   WHEN 'FBA_READY' THEN 'FNSKU'
                   WHEN 'PACK_COMPLETED' THEN 'ORDERS'
                   ELSE 'SCAN'
                 END) AS tracking_type,
        NULL::json AS packer_photos_url,
        o.id AS order_row_id,
        o.shipment_id,
        o.order_id,
        COALESCE(o.account_source, CASE WHEN sal.fnsku IS NOT NULL THEN 'fba' ELSE null END) AS account_source,
        COALESCE(order_trackings.tracking_numbers, '[]'::json) AS tracking_numbers,
        COALESCE(order_trackings.tracking_number_rows, '[]'::json) AS tracking_number_rows,
        COALESCE(
            ff.product_title,
            o.product_title,
            ecwid_lookup.ecwid_product_title,
            sku_catalog_lookup.catalog_product_title,
            sku_stock_lookup.stock_product_title,
            NULLIF(BTRIM(o.item_number), ''),
            NULLIF(BTRIM(o.sku), '')
        ) AS product_title,
        to_char(wa_deadline.deadline_at, 'YYYY-MM-DD HH24:MI:SS') AS ship_by_date,
        to_char(wa_deadline.deadline_at, 'YYYY-MM-DD HH24:MI:SS') AS deadline_at,
        o.item_number,
        o.sale_amount,
        o.currency,
        NULLIF(TRIM(COALESCE(o.condition, '')), '') AS condition,
        COALESCE(o.quantity, sal.metadata->>'quantity') AS quantity,
        COALESCE(
            o.sku,
            ff.sku,
            sal.metadata->>'sku',
            CASE WHEN POSITION(':' IN COALESCE(sal.scan_ref, '')) > 0
                 THEN TRIM(split_part(sal.scan_ref, ':', 1))
                 ELSE NULL
            END
        ) AS sku,
        COALESCE(o.notes, '') AS notes,
        COALESCE(o.status_history, '[]'::jsonb) AS status_history,
        COALESCE(
            NULLIF(TRIM(COALESCE(test_data.serial_number, '')), ''),
            NULLIF(TRIM(COALESCE(sku_lookup.sku_table_serial, '')), '')
        ) AS serial_number,
        sku_lookup.sku_table_id AS sku_table_id,
        test_data.tested_by,
        test_data.test_date_time,
        tested_staff.name AS tested_by_name,
        sal.fnsku,
        (NULLIF(TRIM(sal.metadata->>'fnsku_log_id'), ''))::bigint AS fnsku_log_id,
        stn.carrier                            AS carrier,
        stn.latest_status_code                 AS latest_status_code,
        stn.latest_status_label                AS latest_status_label,
        stn.latest_status_category             AS latest_status_category,
        stn.latest_event_at::text              AS latest_event_at,
        stn.delivered_at::text                 AS delivered_at,
        stn.estimated_delivery_at::text        AS estimated_delivery_at,
        stn.is_delivered                       AS is_delivered,
        stn.has_exception                      AS has_exception,
        stn.exception_at::text                 AS exception_at,
        stn.is_terminal                        AS is_terminal,
        to_char(ship_out.ship_confirmed_at, 'YYYY-MM-DD HH24:MI:SS') AS ship_confirmed_at,
        ship_out.shipped_out_by                AS shipped_out_by,
        shipped_out_staff.name                 AS shipped_out_by_name,
        ${packageCols}
    FROM station_activity_logs sal
    JOIN page ON page.id = sal.id
    LEFT JOIN packer_logs pl ON pl.id = sal.packer_log_id
    LEFT JOIN LATERAL (
        SELECT
            sk.id AS sku_table_id,
            sk.serial_number AS sku_table_serial,
            sk.static_sku AS sku_table_static_sku
        FROM v_sku sk
        WHERE sk.static_sku IS NOT NULL AND BTRIM(sk.static_sku) <> ''
          AND (
              (sal.shipment_id IS NOT NULL AND sk.shipment_id = sal.shipment_id)
              OR BTRIM(sk.static_sku) = BTRIM(COALESCE(sal.scan_ref, ''))
              OR (
                NULLIF(TRIM(sal.metadata->>'sku'), '') IS NOT NULL
                AND BTRIM(sk.static_sku) = BTRIM(sal.metadata->>'sku')
              )
              OR (
                POSITION(':' IN COALESCE(sal.scan_ref, '')) > 0
                AND (
                    BTRIM(sk.static_sku) = BTRIM(split_part(sal.scan_ref, ':', 1))
                    OR BTRIM(sk.static_sku) = BTRIM(sal.scan_ref)
                    OR regexp_replace(UPPER(TRIM(COALESCE(sk.static_sku, ''))), '^0+', '') =
                       regexp_replace(UPPER(TRIM(split_part(sal.scan_ref, ':', 1))), '^0+', '')
                )
              )
          )
        ORDER BY
          CASE WHEN sal.shipment_id IS NOT NULL AND sk.shipment_id = sal.shipment_id THEN 0 ELSE 1 END,
          sk.updated_at DESC NULLS LAST,
          sk.id DESC
        LIMIT 1
    ) sku_lookup ON TRUE
    LEFT JOIN shipping_tracking_numbers stn ON stn.id = sal.shipment_id
    -- Reuse the materialized latest handoff that ordered the page instead of
    -- probing and aggregating station_activity_logs again for every result row.
    LEFT JOIN latest_ship_confirm ship_out ON ship_out.shipment_id = sal.shipment_id
    LEFT JOIN staff shipped_out_staff ON shipped_out_staff.id = ship_out.shipped_out_by
    LEFT JOIN fba_fnskus ff ON ff.fnsku = sal.fnsku
    LEFT JOIN staff packed_staff ON packed_staff.id = sal.staff_id AND sal.station = 'PACK'
    ${packageLinesJoin}
    ${sqlPackerOrderMatchLateral('order_match')} ON TRUE
    LEFT JOIN orders o ON o.id = order_match.id AND o.organization_id = sal.organization_id
    LEFT JOIN orders_exceptions oe ON oe.id = sal.orders_exception_id
    LEFT JOIN LATERAL (
        SELECT COALESCE(
            NULLIF(BTRIM(sc_e.product_title), ''),
            NULLIF(BTRIM(sp_e.display_name), '')
        ) AS ecwid_product_title
        FROM sku_platform_ids sp_e
        LEFT JOIN sku_catalog sc_e ON sc_e.id = sp_e.sku_catalog_id
          AND sc_e.organization_id = sal.organization_id
        WHERE sp_e.platform = 'ecwid'
          AND sp_e.is_active = true
          AND sp_e.organization_id = sal.organization_id
          AND EXISTS (
            SELECT 1
            FROM UNNEST(ARRAY[
                NULLIF(BTRIM(split_part(COALESCE(sku_lookup.sku_table_static_sku, ''), ':', 1)), ''),
                NULLIF(BTRIM(COALESCE(sku_lookup.sku_table_static_sku, '')), ''),
                NULLIF(BTRIM(split_part(COALESCE(sal.metadata->>'sku', ''), ':', 1)), ''),
                NULLIF(BTRIM(COALESCE(sal.metadata->>'sku', '')), ''),
                CASE
                    WHEN POSITION(':' IN COALESCE(sal.scan_ref, '')) > 0
                    THEN NULLIF(BTRIM(split_part(sal.scan_ref, ':', 1)), '')
                    ELSE NULLIF(BTRIM(COALESCE(sal.scan_ref, '')), '')
                END,
                NULLIF(BTRIM(split_part(COALESCE(o.sku, ''), ':', 1)), ''),
                NULLIF(BTRIM(COALESCE(o.sku, '')), ''),
                NULLIF(BTRIM(COALESCE(o.item_number, '')), '')
            ]) AS c(candidate)
            WHERE c.candidate IS NOT NULL AND BTRIM(c.candidate) <> ''
              AND (
                  BTRIM(sp_e.platform_sku) = BTRIM(c.candidate)
                  OR BTRIM(sp_e.platform_item_id) = BTRIM(c.candidate)
                  OR regexp_replace(UPPER(TRIM(COALESCE(sp_e.platform_sku, ''))), '^0+', '') =
                     regexp_replace(UPPER(TRIM(c.candidate)), '^0+', '')
              )
          )
        ORDER BY
            CASE WHEN NULLIF(BTRIM(COALESCE(sc_e.product_title, '')), '') IS NOT NULL THEN 0 ELSE 1 END,
            sp_e.created_at DESC NULLS LAST,
            sp_e.id DESC
        LIMIT 1
    ) ecwid_lookup ON TRUE
    LEFT JOIN LATERAL (
        SELECT sc.product_title AS catalog_product_title
        FROM sku_catalog sc
        WHERE sc.organization_id = sal.organization_id
          AND EXISTS (
            SELECT 1
            FROM UNNEST(ARRAY[
                NULLIF(BTRIM(split_part(COALESCE(sku_lookup.sku_table_static_sku, ''), ':', 1)), ''),
                NULLIF(BTRIM(COALESCE(sku_lookup.sku_table_static_sku, '')), ''),
                NULLIF(BTRIM(split_part(COALESCE(sal.metadata->>'sku', ''), ':', 1)), ''),
                NULLIF(BTRIM(COALESCE(sal.metadata->>'sku', '')), ''),
                CASE
                    WHEN POSITION(':' IN COALESCE(sal.scan_ref, '')) > 0
                    THEN NULLIF(BTRIM(split_part(sal.scan_ref, ':', 1)), '')
                    ELSE NULLIF(BTRIM(COALESCE(sal.scan_ref, '')), '')
                END,
                CASE
                    WHEN POSITION(':' IN COALESCE(sal.scan_ref, '')) > 0
                    THEN NULLIF(BTRIM(split_part(sal.scan_ref, ':', 2)), '')
                    ELSE NULL
                END,
                NULLIF(BTRIM(split_part(COALESCE(o.sku, ''), ':', 1)), ''),
                NULLIF(BTRIM(COALESCE(o.sku, '')), ''),
                NULLIF(BTRIM(COALESCE(o.item_number, '')), ''),
                NULLIF(BTRIM(split_part(COALESCE(ff.sku, ''), ':', 1)), ''),
                NULLIF(BTRIM(COALESCE(ff.sku, '')), '')
            ]) AS c(candidate)
            WHERE c.candidate IS NOT NULL AND BTRIM(c.candidate) <> ''
              AND (
                  BTRIM(sc.sku) = BTRIM(c.candidate)
                  OR regexp_replace(UPPER(TRIM(COALESCE(sc.sku, ''))), '^0+', '') =
                     regexp_replace(UPPER(TRIM(c.candidate)), '^0+', '')
              )
        )
        LIMIT 1
    ) sku_catalog_lookup ON TRUE
    LEFT JOIN LATERAL (
        SELECT ss.product_title AS stock_product_title
        FROM sku_stock ss
        WHERE ss.organization_id = sal.organization_id
          AND EXISTS (
            SELECT 1
            FROM UNNEST(ARRAY[
                NULLIF(BTRIM(split_part(COALESCE(sku_lookup.sku_table_static_sku, ''), ':', 1)), ''),
                NULLIF(BTRIM(COALESCE(sku_lookup.sku_table_static_sku, '')), ''),
                NULLIF(BTRIM(split_part(COALESCE(sal.metadata->>'sku', ''), ':', 1)), ''),
                NULLIF(BTRIM(COALESCE(sal.metadata->>'sku', '')), ''),
                CASE
                    WHEN POSITION(':' IN COALESCE(sal.scan_ref, '')) > 0
                    THEN NULLIF(BTRIM(split_part(sal.scan_ref, ':', 1)), '')
                    ELSE NULLIF(BTRIM(COALESCE(sal.scan_ref, '')), '')
                END,
                CASE
                    WHEN POSITION(':' IN COALESCE(sal.scan_ref, '')) > 0
                    THEN NULLIF(BTRIM(split_part(sal.scan_ref, ':', 2)), '')
                    ELSE NULL
                END,
                NULLIF(BTRIM(split_part(COALESCE(o.sku, ''), ':', 1)), ''),
                NULLIF(BTRIM(COALESCE(o.sku, '')), ''),
                NULLIF(BTRIM(COALESCE(o.item_number, '')), ''),
                NULLIF(BTRIM(split_part(COALESCE(ff.sku, ''), ':', 1)), ''),
                NULLIF(BTRIM(COALESCE(ff.sku, '')), '')
            ]) AS c(candidate)
            WHERE c.candidate IS NOT NULL AND BTRIM(c.candidate) <> ''
              AND (
                  BTRIM(ss.sku) = BTRIM(c.candidate)
                  OR regexp_replace(UPPER(TRIM(COALESCE(ss.sku, ''))), '^0+', '') =
                     regexp_replace(UPPER(TRIM(c.candidate)), '^0+', '')
              )
        )
        ORDER BY
            CASE WHEN NULLIF(BTRIM(COALESCE(ss.product_title, '')), '') IS NULL THEN 1 ELSE 0 END,
            ss.stock DESC NULLS LAST,
            ss.id DESC
        LIMIT 1
    ) sku_stock_lookup ON TRUE
    LEFT JOIN LATERAL (
        SELECT COALESCE(
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
          WHERE osl_link.owner_type = 'ORDER' AND o.id IS NOT NULL
            AND osl_link.owner_id = o.id

          UNION

          SELECT DISTINCT
            o_primary.shipment_id,
            stn_primary.tracking_number_raw,
            true AS is_primary,
            0 AS sort_key
          FROM orders o_primary
          LEFT JOIN shipping_tracking_numbers stn_primary ON stn_primary.id = o_primary.shipment_id
          WHERE o.id IS NOT NULL
            AND o_primary.id = o.id
        ) t
    ) order_trackings ON TRUE
    LEFT JOIN LATERAL (
        SELECT wa.deadline_at
        FROM work_assignments wa
        WHERE wa.entity_type = 'ORDER'
          AND wa.entity_id = o.id
          AND wa.work_type = 'TEST'
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
        LIMIT 1
    ) wa_deadline ON TRUE
    LEFT JOIN LATERAL (
        SELECT
            COALESCE(STRING_AGG(tsn.serial_number, ',' ORDER BY tsn.created_at), '') AS serial_number,
            MIN(tsn.tested_by)::int AS tested_by,
            to_char(MIN(tsn.created_at) AT TIME ZONE 'America/Los_Angeles', 'YYYY-MM-DD HH24:MI:SS') AS test_date_time
        FROM tech_serial_numbers tsn
        WHERE tsn.organization_id = o.organization_id
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
    ) test_data ON TRUE
    LEFT JOIN staff tested_staff ON tested_staff.id = test_data.tested_by
    ORDER BY page.ord
  `;

  // Read-model path (PACKER_LOG_ENRICHMENT_READ). The deadline lateral stays
  // off the spine; hydration fills ship_by_date. delivered_at is on `stn`,
  // which this query already joins.
  const deadlineCols = spineOnly
    ? `NULL::text AS ship_by_date,
        NULL::text AS deadline_at,`
    : `to_char(wa_deadline.deadline_at, 'YYYY-MM-DD HH24:MI:SS') AS ship_by_date,
        to_char(wa_deadline.deadline_at, 'YYYY-MM-DD HH24:MI:SS') AS deadline_at,`;
  const deadlineJoin = spineOnly
    ? ''
    : `LEFT JOIN LATERAL (
        SELECT wa.deadline_at
        FROM work_assignments wa
        WHERE wa.entity_type = 'ORDER'
          AND wa.entity_id = o.id
          AND wa.work_type = 'TEST'
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
        LIMIT 1
    ) wa_deadline ON TRUE`;
  const enrichedQuery = `
    ${pageCteFor(true)}
    SELECT
        sal.id,
        sal.packer_log_id AS packer_log_id,
        to_char(sal.created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at,
        sal.scan_ref,
        COALESCE(stn.tracking_number_raw, oe.shipping_tracking_number, sal.scan_ref, sal.fnsku) AS shipping_tracking_number,
        oe.id AS orders_exception_id,
        oe.exception_reason,
        oe.status AS exception_status,
        CASE WHEN oe.id IS NOT NULL AND o.id IS NULL THEN 'exception' ELSE 'order' END AS row_source,
        CASE WHEN sal.station = 'PACK' THEN sal.staff_id END AS packed_by,
        packed_staff.name AS packed_by_name,
        COALESCE(pl.tracking_type,
                 CASE sal.activity_type
                   WHEN 'FBA_READY' THEN 'FNSKU'
                   WHEN 'PACK_COMPLETED' THEN 'ORDERS'
                   ELSE 'SCAN'
                 END) AS tracking_type,
        NULL::json AS packer_photos_url,
        o.id AS order_row_id,
        o.shipment_id,
        o.order_id,
        COALESCE(o.account_source, CASE WHEN sal.fnsku IS NOT NULL THEN 'fba' ELSE null END) AS account_source,
        COALESCE(enr.tracking_numbers, '[]'::jsonb) AS tracking_numbers,
        COALESCE(enr.tracking_number_rows, '[]'::jsonb) AS tracking_number_rows,
        COALESCE(
            ff.product_title,
            o.product_title,
            enr.external_product_title,
            NULLIF(BTRIM(o.item_number), ''),
            NULLIF(BTRIM(o.sku), '')
        ) AS product_title,
        ${deadlineCols}
        o.item_number,
        o.sale_amount,
        o.currency,
        NULLIF(TRIM(COALESCE(o.condition, '')), '') AS condition,
        COALESCE(o.quantity, sal.metadata->>'quantity') AS quantity,
        COALESCE(
            o.sku,
            ff.sku,
            sal.metadata->>'sku',
            CASE WHEN POSITION(':' IN COALESCE(sal.scan_ref, '')) > 0
                 THEN TRIM(split_part(sal.scan_ref, ':', 1))
                 ELSE NULL
            END
        ) AS sku,
        COALESCE(o.notes, '') AS notes,
        COALESCE(o.status_history, '[]'::jsonb) AS status_history,
        COALESCE(
            NULLIF(TRIM(COALESCE(test_data.serial_number, '')), ''),
            NULLIF(TRIM(COALESCE(enr.sku_table_serial, '')), '')
        ) AS serial_number,
        enr.sku_table_id AS sku_table_id,
        test_data.tested_by,
        test_data.test_date_time,
        tested_staff.name AS tested_by_name,
        sal.fnsku,
        (NULLIF(TRIM(sal.metadata->>'fnsku_log_id'), ''))::bigint AS fnsku_log_id,
        stn.carrier                            AS carrier,
        stn.latest_status_code                 AS latest_status_code,
        stn.latest_status_label                AS latest_status_label,
        stn.latest_status_description          AS latest_status_description,
        stn.latest_status_category             AS latest_status_category,
        stn.latest_event_at::text              AS latest_event_at,
        stn.delivered_at::text                 AS delivered_at,
        stn.estimated_delivery_at::text        AS estimated_delivery_at,
        stn.is_delivered                       AS is_delivered,
        stn.has_exception                      AS has_exception,
        stn.exception_at::text                 AS exception_at,
        stn.is_terminal                        AS is_terminal,
        to_char(ship_out.ship_confirmed_at, 'YYYY-MM-DD HH24:MI:SS') AS ship_confirmed_at,
        ship_out.shipped_out_by                AS shipped_out_by,
        shipped_out_staff.name                 AS shipped_out_by_name,
        ${packageCols}
    FROM station_activity_logs sal
    JOIN page ON page.id = sal.id
    LEFT JOIN packer_logs pl ON pl.id = sal.packer_log_id
    LEFT JOIN packer_log_enrichment enr ON enr.sal_id = sal.id
    LEFT JOIN shipping_tracking_numbers stn ON stn.id = sal.shipment_id
    ${sqlPackerOrderMatchLateral('order_match_fallback', "enr.sal_id IS NULL AND sal.station = 'PACK'")} ON TRUE
    ${PACKAGE_OWNER_LATERAL}
    LEFT JOIN latest_ship_confirm ship_out ON ship_out.shipment_id = sal.shipment_id
    LEFT JOIN staff shipped_out_staff ON shipped_out_staff.id = ship_out.shipped_out_by
    LEFT JOIN fba_fnskus ff ON ff.fnsku = sal.fnsku
    LEFT JOIN staff packed_staff ON packed_staff.id = sal.staff_id AND sal.station = 'PACK'
    ${packageLinesJoin}
    LEFT JOIN orders o ON o.id = COALESCE(enr.order_row_id, order_match_fallback.id, package_owner.id)
      AND o.organization_id = sal.organization_id
    LEFT JOIN orders_exceptions oe ON oe.id = sal.orders_exception_id
    ${deadlineJoin}
    LEFT JOIN LATERAL (
        SELECT
            COALESCE(STRING_AGG(tsn.serial_number, ',' ORDER BY tsn.created_at), '') AS serial_number,
            MIN(tsn.tested_by)::int AS tested_by,
            to_char(MIN(tsn.created_at) AT TIME ZONE 'America/Los_Angeles', 'YYYY-MM-DD HH24:MI:SS') AS test_date_time
        FROM tech_serial_numbers tsn
        WHERE tsn.organization_id = o.organization_id
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
    ) test_data ON TRUE
    LEFT JOIN staff tested_staff ON tested_staff.id = test_data.tested_by
    ORDER BY page.ord
  `;

  let usedEnriched = isPackerLogEnrichmentRead() && !enrichmentTableMissing;

  let result: QueryResult;
  try {
    result = await queryWithRetry(
      () => pool.query(usedEnriched ? enrichedQuery : legacyQuery, params),
      { retries: 3, delayMs: 1000 },
    );
  } catch (error) {
    // The enriched query is the only path referencing `packer_log_enrichment`.
    if (usedEnriched && (error as { code?: string })?.code === '42P01') {
      enrichmentTableMissing = true;
      usedEnriched = false;
      console.warn(
        '[packer-logs-week] packer_log_enrichment missing — falling back to legacy query for this process',
      );
      result = await queryWithRetry(
        () => pool.query(legacyQuery, params),
        { retries: 3, delayMs: 1000 },
      );
    } else {
      throw error;
    }
  }

  const packerLogIds = result.rows
    .map((r: any) => r.packer_log_id)
    .filter((id: any) => id != null);

  // Spine-first skips the photos round-trip; photos arrive via the hydrate call.
  const photosMap: Record<number, any[]> = {};
  const outcomeMap: Record<number, string> = {};
  if (!spineOnly && packerLogIds.length > 0) {
    try {
      const photosResult = await pool.query(
        `SELECT l.entity_id,
                json_agg(
                  json_build_object(
                    'id', p.id,
                    'url', '/api/photos/' || p.id::text || '/content',
                    'uploadedAt', p.created_at,
                    'photoType', p.photo_type
                  )
                  ORDER BY p.created_at
                ) AS photos
           FROM photos p
           JOIN photo_entity_links l
             ON l.photo_id = p.id
            AND l.organization_id = p.organization_id
          WHERE l.entity_type = 'PACKER_LOG'
            AND l.link_role = 'primary'
            AND l.entity_id = ANY($1)
            AND l.organization_id = $2
          GROUP BY l.entity_id`,
        [packerLogIds, orgId],
      );
      for (const row of photosResult.rows) {
        photosMap[row.entity_id] = row.photos;
      }
    } catch (error) {
      console.warn('[packer-logs-week] photo lookup failed; returning rows without photos', error);
    }

    try {
      const outcomeResult = await pool.query<{ entity_id: number; outcome: string }>(
        `SELECT DISTINCT ON (entity_id) entity_id, outcome
           FROM pack_verification_events
          WHERE organization_id = $2
            AND entity_type = 'PACKER_LOG'
            AND entity_id = ANY($1::bigint[])
          ORDER BY entity_id, created_at DESC, id DESC`,
        [packerLogIds, orgId],
      );
      for (const row of outcomeResult.rows) {
        outcomeMap[row.entity_id] = row.outcome;
      }
    } catch (error) {
      // pack_verification_events may be unapplied — degrade without outcomes.
      console.warn('[packer-logs-week] verification outcome lookup skipped', error);
    }
  }

  const rows = result.rows.map((r: any) => ({
    ...r,
    packer_photos_url: photosMap[r.packer_log_id] ?? [],
    verification_outcome: r.packer_log_id != null ? outcomeMap[r.packer_log_id] ?? null : null,
  }));

  // Defer the cache write so it never blocks TTFB. Safe in both Route Handlers
  // and Server Components on Next 16.
  after(() => setCachedJson(CACHE_NAMESPACE, orgId, cacheLookup, rows, cacheTTL, CACHE_TAGS));

  // Heal missing projection rows in the background so subsequent reads stay on
  // the fast path (order_match_fallback above is the correctness safety net).
  // Skipped when we fell back to legacy (table absent) — nothing to heal into.
  if (usedEnriched && rows.length > 0) {
    const salIds = rows.map((r: { id?: unknown }) => Number(r.id)).filter((id) => Number.isFinite(id));
    after(() => {
      pool.query<{ id: number }>(
        `SELECT sal.id
           FROM station_activity_logs sal
           LEFT JOIN packer_log_enrichment enr ON enr.sal_id = sal.id
          WHERE sal.id = ANY($1::int[])
            AND sal.station = 'PACK'
            AND enr.sal_id IS NULL`,
        [salIds],
      )
        .then((missing) => {
          const ids = missing.rows.map((r) => r.id);
          if (ids.length === 0) return;
          return computePackerLogEnrichment(pool, ids);
        })
        .catch((error) => {
          console.warn('[packer-logs-week] deferred enrichment backfill failed', error);
        });
    });
  }

  return { rows, cacheTTL, cacheHit: false };
}
