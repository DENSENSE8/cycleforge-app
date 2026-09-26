import { NextRequest, NextResponse, after } from 'next/server';
import { tenantQuery } from '@/lib/tenancy/db';
import { createCacheLookupKey, getCachedJson, setCachedJson } from '@/lib/cache/upstash-cache';
import { withAuth } from '@/lib/auth/withAuth';
import { escapeLike } from '@/lib/sql-like';

/** Simplified tech-logs query. */

/** A searching fetch ignores the caller's page bound and reads the whole week. */
const SEARCH_ROW_CEILING = 5000;

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const { searchParams } = new URL(req.url);
  const techIdRaw = String(searchParams.get('techId') || '').trim().toLowerCase();
  const wantAll = techIdRaw === 'all';
  const techIdParam = Number(techIdRaw);
  const isAdminFilter =
    !wantAll && Number.isFinite(techIdParam) && techIdParam > 0 && ctx.permissions.has('admin.view_logs');
  const techId = wantAll ? null : isAdminFilter ? techIdParam : ctx.staffId;
  const orgId = ctx.organizationId;
  const weekStart = searchParams.get('weekStart') || '';
  const weekEnd = searchParams.get('weekEnd') || '';
  const searchTerm = (searchParams.get('q') || '').trim();
  const requestedLimit = Number.parseInt(searchParams.get('limit') || '500', 10);
  const requestedOffset = Number.parseInt(searchParams.get('offset') || '0', 10);
  const limit = searchTerm
    ? SEARCH_ROW_CEILING
    : Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 500, 1), 2000);
  const offset = searchTerm ? 0 : Math.max(Number.isFinite(requestedOffset) ? requestedOffset : 0, 0);

  if (!wantAll && !techId) {
    return NextResponse.json({ error: 'techId is required' }, { status: 400 });
  }

  const cacheKey = createCacheLookupKey({
    orgId,
    techId: wantAll ? 'all' : techId,
    weekStart,
    weekEnd,
    limit,
    offset,
    // The query text is part of the ANSWER, so it has to be part of the key —
    // without it a searched page and the unfiltered week share one entry and
    // whichever lands first is served to the other.
    q: searchTerm,
  });
  const isLiveScope = !weekStart;
  const cacheTtl = isLiveScope ? 60 : 3600;

  try {
    const cached = await getCachedJson<unknown[]>('api:tech-logs-v3', cacheKey);
    if (cached) {
      return NextResponse.json(cached, { headers: { 'x-cache': 'HIT' } });
    }

    // Date range: add 1-day buffer on each side for UTC/PST edge cases
    const dateConditions: string[] = [];
    const params: (string | number)[] = [];

    // Staff scope — $1 when filtering one tech; omitted for org-wide `techId=all`.
    let staffClause = '';
    if (!wantAll && techId != null) {
      params.push(techId);
      staffClause = `AND sal.staff_id = $1`;
    }

    // Tenant scope — placeholder index is stable after staff (or $1 when all).
    params.push(orgId);
    const orgIdx = params.length;

    if (weekStart) {
      params.push(weekStart);
      dateConditions.push(`sal.created_at >= ($${params.length}::date - INTERVAL '1 day')`);
    }
    if (weekEnd) {
      params.push(weekEnd);
      dateConditions.push(`sal.created_at < ($${params.length}::date + INTERVAL '2 days')`);
    }

    const dateWhere = dateConditions.length > 0
      ? `AND ${dateConditions.join(' AND ')}`
      : '';

    /** The find box, as SQL — and it lives INSIDE the page CTE, above the LIMIT, which is the whole point. */
    let searchClause = '';
    if (searchTerm) {
      params.push(`%${escapeLike(searchTerm)}%`);
      const q = `$${params.length}`;
      searchClause = `AND (
            sal.scan_ref ILIKE ${q}
            OR sal.fnsku ILIKE ${q}
            OR EXISTS (
              SELECT 1 FROM shipping_tracking_numbers stn_q
              WHERE stn_q.id = sal.shipment_id
                AND stn_q.tracking_number_raw ILIKE ${q}
            )
            OR EXISTS (
              SELECT 1 FROM tech_serial_numbers tsn_q
              WHERE tsn_q.context_station_activity_log_id = sal.id
                AND tsn_q.organization_id = sal.organization_id
                AND tsn_q.serial_number ILIKE ${q}
            )
            OR EXISTS (
              SELECT 1 FROM fba_fnskus ff_q
              WHERE ff_q.fnsku = sal.fnsku
                AND ff_q.organization_id = sal.organization_id
                AND (ff_q.product_title ILIKE ${q} OR ff_q.sku ILIKE ${q})
            )
            OR EXISTS (
              SELECT 1 FROM orders o_q
              LEFT JOIN shipment_links osl_q
                ON osl_q.owner_id = o_q.id AND osl_q.owner_type = 'ORDER'
              WHERE sal.shipment_id IS NOT NULL
                AND o_q.organization_id = sal.organization_id
                AND (osl_q.shipment_id = sal.shipment_id OR o_q.shipment_id = sal.shipment_id)
                AND (
                  o_q.order_id ILIKE ${q}
                  OR o_q.product_title ILIKE ${q}
                  OR o_q.sku ILIKE ${q}
                  OR o_q.item_number ILIKE ${q}
                  OR o_q.notes ILIKE ${q}
                )
            )
          )`;
    }

    params.push(limit, offset);
    const limitIdx = params.length - 1;
    const offsetIdx = params.length;

    const query = `
      WITH recent_logs AS MATERIALIZED (
        SELECT
          sal.id,
          sal.activity_type,
          sal.created_at,
          sal.staff_id,
          sal.fnsku,
          sal.shipment_id,
          sal.scan_ref,
          sal.organization_id
        FROM station_activity_logs sal
        WHERE sal.station = 'TECH'
          AND sal.activity_type IN ('TRACKING_SCANNED', 'FNSKU_SCANNED')
          ${staffClause}
          AND sal.organization_id = $${orgIdx}
          ${dateWhere}
          ${searchClause}
        ORDER BY sal.created_at DESC NULLS LAST
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
      )
      SELECT
        sal.id,
        sal.id AS source_row_id,
        CASE
          WHEN sal.activity_type = 'FNSKU_SCANNED' THEN 'fba_scan'
          WHEN sal.activity_type = 'TRACKING_SCANNED'
            AND COALESCE(serials.has_serials, false) THEN 'tech_serial'
          ELSE 'tech_scan'
        END AS source_kind,
        sal.created_at,
        sal.staff_id AS tested_by,
        sal.fnsku,
        sal.shipment_id,

        -- Tracking display: carrier tracking > raw scan > fnsku
        COALESCE(stn.tracking_number_raw, sal.scan_ref, sal.fnsku) AS shipping_tracking_number,

        serials.serial_number,

        -- Order data (via shipment_id join)
        ord_match.id AS order_db_id,
        ord_match.order_id,
        COALESCE(ff.product_title, ord_match.product_title) AS product_title,
        ord_match.item_number,
        ord_match.condition,
        COALESCE(ff.sku, ord_match.sku) AS sku,
        ord_match.quantity,
        ord_match.notes,
        COALESCE(ord_match.status_history, '[]'::jsonb) AS status_history,
        COALESCE(ord_match.account_source,
          CASE WHEN sal.fnsku IS NOT NULL THEN 'fba' ELSE NULL END
        ) AS account_source,
        ord_match.is_out_of_stock,
        COALESCE(order_trackings.tracking_numbers, '[]'::json) AS tracking_numbers,
        COALESCE(order_trackings.tracking_number_rows, '[]'::json) AS tracking_number_rows,
        COALESCE(
          stn.is_carrier_accepted OR stn.is_in_transit OR stn.is_out_for_delivery OR stn.is_delivered,
          false
        ) AS is_shipped,
        to_char(wa_d.deadline_at, 'YYYY-MM-DD') AS ship_by_date,

        -- FBA log FK (for lifecycle tracking)
        fl.id AS fnsku_log_id,

        COALESCE(serials.has_sku_serial_source, false) AS has_sku_serial_source

      FROM recent_logs sal
      LEFT JOIN shipping_tracking_numbers stn ON stn.id = sal.shipment_id
      LEFT JOIN fba_fnskus ff ON ff.fnsku = sal.fnsku AND ff.organization_id = sal.organization_id
      LEFT JOIN fba_fnsku_logs fl ON fl.station_activity_log_id = sal.id
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) > 0 AS has_serials,
          STRING_AGG(tsn.serial_number, ',' ORDER BY tsn.created_at) AS serial_number,
          COALESCE(BOOL_OR(tsn.source_sku_id IS NOT NULL), false) AS has_sku_serial_source
        FROM tech_serial_numbers tsn
        WHERE tsn.context_station_activity_log_id = sal.id
      ) serials ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          o.id,
          o.order_id,
          o.product_title,
          o.item_number,
          o.condition,
          o.sku,
          o.quantity,
          o.notes,
          o.status_history,
          o.account_source,
          o.is_out_of_stock,
          o.created_at
        FROM orders o
        LEFT JOIN shipment_links osl ON osl.owner_id = o.id AND osl.owner_type = 'ORDER'
        WHERE sal.shipment_id IS NOT NULL
          AND o.organization_id = sal.organization_id
          AND (
            osl.shipment_id = sal.shipment_id
            OR o.shipment_id = sal.shipment_id
          )
        ORDER BY
          CASE
            WHEN osl.shipment_id = sal.shipment_id THEN 0
            WHEN o.shipment_id = sal.shipment_id THEN 1
            ELSE 2
          END,
          CASE WHEN COALESCE(osl.is_primary, false) THEN 0 ELSE 1 END,
          o.created_at DESC NULLS LAST,
          o.id DESC
        LIMIT 1
      ) ord_match ON TRUE
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
          WHERE osl_link.owner_type = 'ORDER' AND ord_match.id IS NOT NULL
            AND osl_link.owner_id = ord_match.id

          UNION

          SELECT DISTINCT
            o_primary.shipment_id,
            stn_primary.tracking_number_raw,
            true AS is_primary,
            0 AS sort_key
          FROM orders o_primary
          LEFT JOIN shipping_tracking_numbers stn_primary ON stn_primary.id = o_primary.shipment_id
          WHERE ord_match.id IS NOT NULL
            AND o_primary.id = ord_match.id
        ) t
      ) order_trackings ON TRUE
      LEFT JOIN LATERAL (
        SELECT wa.deadline_at FROM work_assignments wa
        WHERE wa.entity_type = 'ORDER' AND wa.entity_id = ord_match.id AND wa.work_type = 'TEST'
        ORDER BY
          CASE wa.status WHEN 'IN_PROGRESS' THEN 1 WHEN 'ASSIGNED' THEN 2 WHEN 'OPEN' THEN 3 WHEN 'DONE' THEN 4 ELSE 5 END,
          wa.updated_at DESC, wa.id DESC
        LIMIT 1
      ) wa_d ON ord_match.id IS NOT NULL

      ORDER BY sal.created_at DESC NULLS LAST
    `;

    const result = await tenantQuery(orgId, query, params);
    const rows = result.rows;

    after(() => setCachedJson('api:tech-logs-v3', cacheKey, rows, cacheTtl, ['tech-logs']));
    return NextResponse.json(rows, { headers: { 'x-cache': 'MISS' } });
  } catch (error: any) {
    console.error('Error fetching tech logs:', error);
    return NextResponse.json({ error: 'Failed to fetch tech logs', details: error.message }, { status: 500 });
  }
}, { permission: 'tech.view' });
