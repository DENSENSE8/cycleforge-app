/**
 * global-entity-search — per-entity exact/ILIKE searchers extracted from
 * src/app/api/global-search/route.ts (AI search Phase 0) so the hybrid
 * engine's exact-ID/serial bypass REUSES them instead of duplicating the
 * last-8 / normalization / aggregation logic. The route imports from here.
 *
 * These hit the PARENT tables directly (orders + tech_serial_numbers +
 * serial_units + shipping_tracking_numbers joins, etc.) — they are the
 * deterministic fast path that must never be removed (plan non-goal),
 * independent of entity_search_docs freshness.
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { looksLikeTicketScan } from '@/lib/support/ticket-scan';
import { searchSupportTickets } from '@/lib/search/support-ticket-search';
import { searchHitHref } from '@/lib/search/search-hit';
import {
  receivingOrderIdFromParts,
  receivingSearchTitle,
} from '@/lib/search/receiving-search-title';
import { orderTrackingMatchKeys } from '@/lib/tracking-format';
import { sqlOrderHasMatchingTracking } from '@/lib/search/order-tracking-match-sql';
import type { SearchByScope } from '@/lib/search/search-by';
import {
  hasInternalIdKeys,
  isPrintedHandlePayload,
  parseInternalIdQuery,
} from '@/lib/search/internal-id';

/** Match `serial_units.normalized_serial` (trim + upper) without pulling neon queries. */
function normalizeSerialQuery(raw: string): string {
  return String(raw || '').trim().toUpperCase();
}

export interface GlobalSearchResult {
  id: number;
  entityType:
    | 'order'
    | 'repair'
    | 'fba'
    | 'receiving'
    | 'sku'
    | 'unit'
    | 'exception'
    | 'import_exception';
  title: string;
  subtitle: string;
  href: string;
  matchField: string;
  /**
   * Optional facet bag — same keys as doc-arm SearchHit.facets. Exact hits
   * ranked first used to omit these, leaving Status/Tracking/Date empty on the
   * rows operators see most. Hydrate when the parent-table SELECT already has
   * the columns (or cheaply can).
   */
  facets?: {
    status?: string | null;
    condition_grade?: string | null;
    source_platform?: string | null;
    tracking_number?: string | null;
    carrier?: string | null;
    serial_number?: string | null;
    /** Marketplace order id — powers the leading OrderIdChip last-8. */
    order_id?: string | null;
    /** Receiving carton Zoho PO# (when order_id not set). */
    po_number?: string | null;
    /** Receiving marketplace source order id. */
    source_order_id?: string | null;
    happened_at?: string | null;
  };
}

async function searchOrders(orgId: OrgId, query: string, limit: number): Promise<GlobalSearchResult[]> {
  // Mirror the unshipped/shipped order search: match order_id, title, SKU, the
  // order's serial number(s) (tech_serial_numbers, order-grain join) and
  // the carrier tracking number, plus a last-8-digit fallback so a partial
  // order/tracking number still resolves. Serials are aggregated per order so a
  // single row comes back even when an order has many tested units.
  // Tenant scope: the org lock is `o.organization_id`; the tech_serial_numbers /
  // shipping_tracking_numbers joins reach only rows tied to that org-scoped order
  // (the GUC set by tenantQuery is the backstop) — same pattern as searchReceiving.
  //
  // Tracking match is relaxed: `orders.shipment_id` (packer-set primary cache)
  // OR `shipment_links` (ingest / tech / split). Packer_logs are not required.
  const digits = query.replace(/\D/g, '');
  const last8 = digits.length >= 8 ? digits.slice(-8) : '';
  const keys = orderTrackingMatchKeys(query);
  const trackingMatch = sqlOrderHasMatchingTracking({
    orderAlias: 'o',
    likeParam: '$2',
    canonicalParam: '$6',
    key18Param: '$7',
    last8Param: '$4',
  });
  const result = await tenantQuery(
    orgId,
    `SELECT o.id,
            o.order_id,
            o.product_title,
            o.sku,
            o.account_source,
            o.status,
            o.condition,
            o.order_date,
            o.created_at,
            COALESCE(STRING_AGG(DISTINCT tsn.serial_number, ', '), '') AS serial_number,
            COALESCE(MAX(stn.tracking_number_raw), MAX(stn_link.tracking_number_raw)) AS tracking_number,
            COALESCE(MAX(NULLIF(stn.carrier, 'UNKNOWN')), MAX(NULLIF(stn_link.carrier, 'UNKNOWN'))) AS carrier
     FROM orders o
     LEFT JOIN tech_serial_numbers tsn       ON (
       tsn.organization_id = o.organization_id
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
     )
     LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
     LEFT JOIN shipment_links sl
       ON sl.owner_type = 'ORDER'
      AND sl.owner_id = o.id
      AND sl.organization_id = o.organization_id
     LEFT JOIN shipping_tracking_numbers stn_link ON stn_link.id = sl.shipment_id
     WHERE o.organization_id = $1
       AND (
            o.order_id ILIKE $2
         OR o.product_title ILIKE $2
         OR o.sku ILIKE $2
         OR tsn.serial_number ILIKE $2
         OR CAST(o.id AS TEXT) = $3
         OR ($4 <> '' AND RIGHT(regexp_replace(COALESCE(o.order_id, ''), '[^0-9]', '', 'g'), 8) = $4)
         OR ${trackingMatch}
       )
     GROUP BY o.id
     ORDER BY o.created_at DESC NULLS LAST
     LIMIT $5`,
    [orgId, `%${query}%`, query, last8, limit, keys.exact, keys.key18],
  );

  return result.rows.map((row: any) => {
    const serial = String(row.serial_number || '').trim() || null;
    const happened =
      row.order_date || row.created_at
        ? new Date(row.order_date || row.created_at).toISOString()
        : null;
    return {
      id: Number(row.id),
      entityType: 'order' as const,
      title: String(row.product_title || `Order #${row.id}`),
      subtitle: [row.order_id, row.serial_number, row.sku, row.account_source]
        .filter(Boolean)
        .join(' · '),
      // Search feedback shell — kept in sync with searchHitHref('ORDER').
      href: searchHitHref('ORDER', Number(row.id)),
      matchField: 'order',
      facets: {
        status: row.status != null ? String(row.status) : null,
        condition_grade: row.condition != null ? String(row.condition) : null,
        source_platform: row.account_source != null ? String(row.account_source) : null,
        tracking_number: row.tracking_number != null ? String(row.tracking_number) : null,
        carrier: row.carrier != null ? String(row.carrier) : null,
        // Exact path aggregates serials; only emit a single serial for the chip.
        serial_number: serial && !serial.includes(',') ? serial : null,
        order_id: row.order_id != null ? String(row.order_id) : null,
        happened_at: happened,
      },
    };
  });
}

async function searchRepairs(orgId: OrgId, query: string, limit: number): Promise<GlobalSearchResult[]> {
  const result = await tenantQuery(
    orgId,
    `SELECT id, ticket_number, product_title, serial_number, status
     FROM repair_service
     WHERE organization_id = $4
       AND (ticket_number ILIKE $1
        OR product_title ILIKE $1
        OR serial_number ILIKE $1
        OR CAST(id AS TEXT) = $2)
     ORDER BY created_at DESC NULLS LAST
     LIMIT $3`,
    [`%${query}%`, query, limit, orgId],
  );

  return result.rows.map((row: any) => ({
    id: Number(row.id),
    entityType: 'repair' as const,
    title: String(row.product_title || `Repair #${row.id}`),
    subtitle: [row.ticket_number, row.status].filter(Boolean).join(' · '),
    href: `/repair?tab=active&openRepair=${row.id}`,
    matchField: 'repair',
    facets: {
      status: row.status != null ? String(row.status) : null,
      serial_number: row.serial_number != null ? String(row.serial_number) : null,
    },
  }));
}

async function searchFba(orgId: OrgId, query: string, limit: number): Promise<GlobalSearchResult[]> {
  const result = await tenantQuery(
    orgId,
    `SELECT id, shipment_ref, status
     FROM fba_shipments
     WHERE organization_id = $3
       AND (shipment_ref ILIKE $1
        OR CAST(id AS TEXT) = $2)
     ORDER BY created_at DESC NULLS LAST
     LIMIT $4`,
    [`%${query}%`, query, orgId, limit],
  );

  return result.rows.map((row: any) => ({
    id: Number(row.id),
    entityType: 'fba' as const,
    title: String(row.shipment_ref || `FBA #${row.id}`),
    subtitle: String(row.status || 'Pending'),
    href: `/fba?openShipmentId=${row.id}`,
    matchField: 'fba',
    facets: {
      status: row.status != null ? String(row.status) : null,
      source_platform: 'fba',
    },
  }));
}

async function searchReceiving(orgId: OrgId, query: string, limit: number): Promise<GlobalSearchResult[]> {
  // Join shipping_tracking_numbers so search matches rows reachable only via
  // receiving.shipment_id (post inbound-tracking unification). Falls back to
  // hyphens/spaces carriers sometimes include. Also match Zoho PO /
  // source_order_id — operators often paste those as the "order #" search.
  // Tenant scope: receiving carries organization_id, so filter on it. The
  // shipping_tracking_numbers join (`stn`) has NO organization_id column yet
  // (NEEDS-COL) — it is reachable only through this org-scoped receiving row,
  // so the GUC-wrapped tenantQuery is the isolation backstop for it.
  const normalizedQuery = query.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const result = await tenantQuery(
    orgId,
    `SELECT r.id,
            stn.tracking_number_raw AS tracking_number,
            COALESCE(NULLIF(stn.carrier, 'UNKNOWN'), r.carrier)             AS carrier,
            r.zoho_purchaseorder_number AS po_number,
            r.source_order_id,
            r.qa_status,
            r.condition_grade,
            r.source_platform,
            r.intake_type,
            r.return_platform::text AS return_platform,
            COALESCE(r.is_return, false) AS is_return,
            lines.line_count,
            lines.distinct_sku_count,
            lines.first_item_name
     FROM receiving_carton r
     LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS line_count,
              COUNT(DISTINCT COALESCE(NULLIF(TRIM(rl.sku), ''), NULLIF(TRIM(rl.item_name), ''), rl.id::text))::int
                AS distinct_sku_count,
              (ARRAY_AGG(rl.item_name ORDER BY rl.id)
                FILTER (WHERE NULLIF(TRIM(rl.item_name), '') IS NOT NULL))[1] AS first_item_name
       FROM receiving_line rl WHERE rl.receiving_id = r.id
     ) lines ON TRUE
     WHERE r.organization_id = $5
       AND (stn.tracking_number_raw ILIKE $1
        OR stn.tracking_number_normalized = $3
        OR CAST(r.id AS TEXT) = $2
        OR r.zoho_purchaseorder_number ILIKE $1
        OR r.source_order_id ILIKE $1
        OR ($3 <> '' AND regexp_replace(UPPER(COALESCE(r.zoho_purchaseorder_number, '')), '[^A-Z0-9]', '', 'g') = $3)
        OR ($3 <> '' AND regexp_replace(UPPER(COALESCE(r.source_order_id, '')), '[^A-Z0-9]', '', 'g') = $3))
     ORDER BY r.id DESC
     LIMIT $4`,
    [`%${query}%`, query, normalizedQuery, limit, orgId],
  );

  return result.rows.map((row: any) => {
    const poNumber = row.po_number != null ? String(row.po_number) : null;
    const sourceOrderId = row.source_order_id != null ? String(row.source_order_id) : null;
    const sourcePlatform = row.source_platform != null ? String(row.source_platform) : null;
    const firstItemName = row.first_item_name != null ? String(row.first_item_name) : null;
    const orderId = receivingOrderIdFromParts(poNumber, sourceOrderId);
    return {
      id: Number(row.id),
      entityType: 'receiving' as const,
      title: receivingSearchTitle({
        lineCount: Number(row.line_count) || 0,
        distinctSkuCount: Number(row.distinct_sku_count) || 0,
        poNumber,
        sourceOrderId,
        sourcePlatform,
        intakeType: row.intake_type != null ? String(row.intake_type) : null,
        returnPlatform: row.return_platform != null ? String(row.return_platform) : null,
        isReturn: row.is_return === true,
        firstItemName,
        fallback: row.tracking_number
          ? `Carton · ${String(row.tracking_number).slice(-8)}`
          : 'Unmatched carton',
      }),
      subtitle: [orderId, row.carrier].filter(Boolean).join(' · ') || 'Unknown carrier',
      // Compose the SoT rather than re-deriving: this fast path and hybrid
      // retrieval must land a carton on the SAME surface, and the hardcoded twin
      // is how they drifted when RECEIVING moved to the read-only inspector.
      href: searchHitHref('RECEIVING', Number(row.id)),
      matchField: 'receiving',
      facets: {
        status: row.qa_status != null ? String(row.qa_status) : null,
        condition_grade: row.condition_grade != null ? String(row.condition_grade) : null,
        source_platform: sourcePlatform,
        tracking_number: row.tracking_number != null ? String(row.tracking_number) : null,
        carrier: row.carrier != null ? String(row.carrier) : null,
        order_id: orderId || null,
        po_number: poNumber,
        source_order_id: sourceOrderId,
      },
    };
  });
}

async function searchSkus(orgId: OrgId, query: string, limit: number): Promise<GlobalSearchResult[]> {
  // sku_catalog is the marketplace SKU scheme the Products workbench selects on
  // (NOT the Zoho `items` namespace — they collide on the same strings). Match
  // the SKU string or title; deep-link to the workbench with the numeric
  // sku_catalog.id, which the sidebar picker reads from ?skuId=.
  const result = await tenantQuery(
    orgId,
    `SELECT id, sku, product_title
     FROM sku_catalog
     WHERE organization_id = $3
       AND is_active = true
       AND (sku ILIKE $1 OR product_title ILIKE $1)
     ORDER BY CASE WHEN UPPER(sku) = UPPER($2) THEN 0 ELSE 1 END,
              product_title ASC NULLS LAST
     LIMIT $4`,
    [`%${query}%`, query, orgId, limit],
  );

  return result.rows.map((row: any) => ({
    id: Number(row.id),
    entityType: 'sku' as const,
    title: String(row.product_title || row.sku),
    subtitle: String(row.sku),
    href: `/products?view=qc&skuId=${row.id}`,
    matchField: 'sku',
  }));
}

/**
 * Exact/ILIKE over serial_units — header Find + hybrid exact arm. Independent
 * of entity_search_docs so AI-off classic `/api/global-search` still surfaces
 * unit serials (receiving unfound units included).
 */
async function searchSerialUnits(
  orgId: OrgId,
  query: string,
  limit: number,
): Promise<GlobalSearchResult[]> {
  const normalized = normalizeSerialQuery(query);
  if (!normalized) return [];
  const result = await tenantQuery(
    orgId,
    `SELECT su.id,
            su.serial_number,
            su.normalized_serial,
            su.sku,
            su.current_status::text AS current_status,
            su.condition_grade
     FROM serial_units su
     WHERE su.organization_id = $4
       AND (
            su.normalized_serial = $2
         OR su.serial_number ILIKE $1
         OR su.normalized_serial ILIKE $1
         OR CAST(su.id AS TEXT) = $3
       )
     ORDER BY CASE
                WHEN su.normalized_serial = $2 THEN 0
                WHEN UPPER(TRIM(su.serial_number)) = $2 THEN 0
                ELSE 1
              END,
              su.id DESC
     LIMIT $5`,
    [`%${normalized}%`, normalized, query, orgId, limit],
  );

  return result.rows.map((row: any) => {
    const serial = String(row.serial_number || row.normalized_serial || '').trim();
    const sku = row.sku != null ? String(row.sku) : null;
    const status = row.current_status != null ? String(row.current_status) : null;
    return {
      id: Number(row.id),
      entityType: 'unit' as const,
      title: serial || `Unit #${row.id}`,
      subtitle: [serial, sku, status].filter(Boolean).join(' · '),
      href: searchHitHref('SERIAL_UNIT', Number(row.id)),
      matchField: 'serial',
      facets: {
        status,
        condition_grade: row.condition_grade != null ? String(row.condition_grade) : null,
        serial_number: serial || null,
      },
    };
  });
}

/**
 * Tech / packer unmatched-tracking holds (`orders_exceptions`) and sheet
 * import holds (`order_import_exceptions`). These are not live orders — a
 * tracking can exist only here when ingest failed (no item number) or a
 * station scan missed the order table. Header find must still surface them.
 */
async function searchTrackingHolds(
  orgId: OrgId,
  query: string,
  limit: number,
): Promise<GlobalSearchResult[]> {
  const keys = orderTrackingMatchKeys(query);
  const last8 = /^\d{8}$/.test(keys.last8) ? keys.last8 : '';
  const like = `%${query}%`;

  const [scanHolds, importHolds] = await Promise.all([
    tenantQuery(
      orgId,
      `SELECT id, shipping_tracking_number, source_station, staff_name,
              exception_reason, status, created_at
       FROM orders_exceptions
       WHERE organization_id = $1
         AND status = 'open'
         AND (
              shipping_tracking_number ILIKE $2
           OR regexp_replace(UPPER(COALESCE(shipping_tracking_number, '')), '[^A-Z0-9]', '', 'g') = $3
           OR ($4 <> '' AND RIGHT(regexp_replace(UPPER(COALESCE(shipping_tracking_number, '')), '[^A-Z0-9]', '', 'g'), 18) = $4)
           OR ($5 <> '' AND RIGHT(regexp_replace(COALESCE(shipping_tracking_number, ''), '[^0-9]', '', 'g'), 8) = $5)
         )
       ORDER BY updated_at DESC, id DESC
       LIMIT $6`,
      [orgId, like, keys.exact, keys.key18, last8, limit],
    ).catch(() => ({ rows: [] as Array<Record<string, unknown>> })),
    tenantQuery(
      orgId,
      `SELECT id, account_order_id, account_source, product_title, tracking,
              reason, status, first_seen_at
       FROM order_import_exceptions
       WHERE organization_id = $1
         AND status = 'open'
         AND ignored_at IS NULL
         AND (
              tracking ILIKE $2
           OR account_order_id ILIKE $2
           OR product_title ILIKE $2
           OR regexp_replace(UPPER(COALESCE(tracking, '')), '[^A-Z0-9]', '', 'g') = $3
           OR ($4 <> '' AND RIGHT(regexp_replace(UPPER(COALESCE(tracking, '')), '[^A-Z0-9]', '', 'g'), 18) = $4)
           OR ($5 <> '' AND RIGHT(regexp_replace(COALESCE(tracking, ''), '[^0-9]', '', 'g'), 8) = $5)
         )
       ORDER BY last_seen_at DESC NULLS LAST, id DESC
       LIMIT $6`,
      [orgId, like, keys.exact, keys.key18, last8, limit],
    ).catch(() => ({ rows: [] as Array<Record<string, unknown>> })),
  ]);

  const scanHits: GlobalSearchResult[] = scanHolds.rows.map((row: Record<string, unknown>) => {
    const tracking = row.shipping_tracking_number != null ? String(row.shipping_tracking_number) : '';
    const station = row.source_station != null ? String(row.source_station) : 'unknown';
    const happened = row.created_at ? new Date(String(row.created_at)).toISOString() : null;
    return {
      id: Number(row.id),
      entityType: 'exception' as const,
      title: `Tracking exception · ${station}`,
      subtitle: [row.exception_reason, row.staff_name, tracking].filter(Boolean).join(' · '),
      href: `/shipping/orders?search=${encodeURIComponent(tracking || query)}`,
      matchField: 'tracking',
      facets: {
        status: row.status != null ? String(row.status) : null,
        tracking_number: tracking || null,
        happened_at: happened,
      },
    };
  });

  const importHits: GlobalSearchResult[] = importHolds.rows.map((row: Record<string, unknown>) => {
    const tracking = row.tracking != null ? String(row.tracking) : '';
    const orderId = row.account_order_id != null ? String(row.account_order_id) : null;
    const title = String(row.product_title || orderId || `Import exception #${row.id}`);
    const happened = row.first_seen_at ? new Date(String(row.first_seen_at)).toISOString() : null;
    return {
      id: Number(row.id),
      entityType: 'import_exception' as const,
      title,
      subtitle: [orderId, row.account_source, row.reason].filter(Boolean).join(' · '),
      href: `/review?mode=catalog-link&section=missing-item-number&exceptionId=${Number(row.id)}`,
      matchField: 'tracking',
      facets: {
        status: row.status != null ? String(row.status) : null,
        source_platform: row.account_source != null ? String(row.account_source) : null,
        tracking_number: tracking || null,
        order_id: orderId,
        happened_at: happened,
      },
    };
  });

  return [...importHits, ...scanHits];
}

/**
 * Cycle Forge keys only — shipment id, receiving PK / R-id, unit PK, and
 * printed QR / Digital Link payloads decoded to those keys. Never ILIKE
 * titles, tracking, or marketplace order numbers.
 */
async function searchInternalIds(
  orgId: OrgId,
  query: string,
  limit: number,
): Promise<GlobalSearchResult[]> {
  const keys = parseInternalIdQuery(query);
  if (!hasInternalIdKeys(keys)) return [];
  const internalStartedAt = Date.now();

  let receivingIds = [...keys.receivingIds];
  if (keys.receivingLineIds.length > 0) {
    const lines = await tenantQuery(
      orgId,
      `SELECT receiving_id
       FROM receiving_line
       WHERE organization_id = $1
         AND id = ANY($2::bigint[])
         AND receiving_id IS NOT NULL`,
      [orgId, keys.receivingLineIds],
    ).catch(() => ({ rows: [] as Array<Record<string, unknown>> }));
    for (const row of lines.rows) {
      const id = Number(row.receiving_id);
      if (Number.isSafeInteger(id) && id > 0) receivingIds.push(id);
    }
  }
  receivingIds = [...new Set(receivingIds)];

  const receivingPromise =
    receivingIds.length > 0 || keys.shipmentIds.length > 0
      ? tenantQuery(
          orgId,
          `SELECT r.id,
                  r.shipment_id,
                  stn.tracking_number_raw AS tracking_number,
                  COALESCE(NULLIF(stn.carrier, 'UNKNOWN'), r.carrier) AS carrier,
                  r.zoho_purchaseorder_number AS po_number,
                  r.source_order_id,
                  r.source_platform
           FROM receiving_carton r
           LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
           WHERE r.organization_id = $1
             AND (
                  (cardinality($2::bigint[]) > 0 AND r.id = ANY($2::bigint[]))
               OR (cardinality($3::bigint[]) > 0 AND r.shipment_id = ANY($3::bigint[]))
             )
           ORDER BY r.id DESC
           LIMIT $4`,
          [orgId, receivingIds, keys.shipmentIds, limit],
        ).catch(() => ({ rows: [] as Array<Record<string, unknown>> }))
      : Promise.resolve({ rows: [] as Array<Record<string, unknown>> });

  const orderPromise =
    keys.orderPks.length > 0 || keys.shipmentIds.length > 0
      ? tenantQuery(
          orgId,
          `SELECT o.id,
                  o.order_id,
                  o.product_title,
                  o.sku,
                  o.account_source,
                  o.shipment_id,
                  o.status
           FROM orders o
           WHERE o.organization_id = $1
             AND (
                  (cardinality($2::bigint[]) > 0 AND o.id = ANY($2::bigint[]))
               OR (cardinality($3::bigint[]) > 0 AND o.shipment_id = ANY($3::bigint[]))
             )
           ORDER BY o.id DESC
           LIMIT $4`,
          [orgId, keys.orderPks, keys.shipmentIds, limit],
        ).catch(() => ({ rows: [] as Array<Record<string, unknown>> }))
      : Promise.resolve({ rows: [] as Array<Record<string, unknown>> });

  const unitPromise =
    keys.unitKeys.length > 0
      ? tenantQuery(
          orgId,
          `SELECT su.id,
                  su.serial_number,
                  su.normalized_serial,
                  su.sku,
                  su.current_status::text AS current_status
           FROM serial_units su
           WHERE su.organization_id = $1
             AND (
                  CAST(su.id AS TEXT) = ANY($2::text[])
               OR su.normalized_serial = ANY($3::text[])
               OR su.unit_uid = ANY($2::text[])
             )
           ORDER BY su.id DESC
           LIMIT $4`,
          [
            orgId,
            keys.unitKeys,
            keys.unitKeys.map((k) => k.toUpperCase()),
            limit,
          ],
        ).catch(() => ({ rows: [] as Array<Record<string, unknown>> }))
      : Promise.resolve({ rows: [] as Array<Record<string, unknown>> });

  const timed = async <T,>(name: string, promise: Promise<T>): Promise<{ name: string; ms: number; result: T }> => {
    const t0 = Date.now();
    const result = await promise;
    return { name, ms: Date.now() - t0, result };
  };
  const [receivingTimed, ordersTimed, unitsTimed] = await Promise.all([
    timed('receiving', receivingPromise),
    timed('orders', orderPromise),
    timed('units', unitPromise),
  ]);
  const receiving = receivingTimed.result;
  const orders = ordersTimed.result;
  const units = unitsTimed.result;
  // #region agent log
  fetch('http://127.0.0.1:7905/ingest/963a9b6c-b9e1-4ea4-8873-db315c94d962',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'05d676'},body:JSON.stringify({sessionId:'05d676',hypothesisId:'C',location:'global-entity-search.ts:searchInternalIds',message:'internal id queries finished',data:{totalMs:Date.now()-internalStartedAt,receivingMs:receivingTimed.ms,ordersMs:ordersTimed.ms,unitsMs:unitsTimed.ms,receivingRows:receiving.rows.length,orderRows:orders.rows.length,unitRows:units.rows.length,exactHandle:keys.exactHandle,receivingIds:keys.receivingIds.length,shipmentIds:keys.shipmentIds.length,orderPks:keys.orderPks.length,unitKeys:keys.unitKeys.length},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  const receivingHits: GlobalSearchResult[] = receiving.rows.map((row) => {
    const id = Number(row.id);
    const shipmentId = row.shipment_id != null ? Number(row.shipment_id) : null;
    const matchedShipment =
      shipmentId != null && keys.shipmentIds.includes(shipmentId) && !receivingIds.includes(id);
    const poNumber = row.po_number != null ? String(row.po_number) : null;
    const sourceOrderId = row.source_order_id != null ? String(row.source_order_id) : null;
    return {
      id,
      entityType: 'receiving' as const,
      title: `R-${id}`,
      subtitle: [poNumber || sourceOrderId, row.tracking_number, row.carrier]
        .filter(Boolean)
        .join(' · '),
      href: searchHitHref('RECEIVING', id),
      matchField: matchedShipment ? 'shipment' : 'receiving',
      facets: {
        source_platform: row.source_platform != null ? String(row.source_platform) : null,
        tracking_number: row.tracking_number != null ? String(row.tracking_number) : null,
        carrier: row.carrier != null ? String(row.carrier) : null,
        po_number: poNumber,
        source_order_id: sourceOrderId,
      },
    };
  });

  const orderHits: GlobalSearchResult[] = orders.rows.map((row) => {
    const id = Number(row.id);
    const shipmentId = row.shipment_id != null ? Number(row.shipment_id) : null;
    const matchedShipment =
      shipmentId != null && keys.shipmentIds.includes(shipmentId) && !keys.orderPks.includes(id);
    return {
      id,
      entityType: 'order' as const,
      title: String(row.product_title || `Order #${id}`),
      subtitle: [row.order_id, shipmentId != null ? `shipment ${shipmentId}` : null, row.sku]
        .filter(Boolean)
        .join(' · '),
      href: searchHitHref('ORDER', id),
      matchField: matchedShipment ? 'shipment' : 'id',
      facets: {
        status: row.status != null ? String(row.status) : null,
        source_platform: row.account_source != null ? String(row.account_source) : null,
        order_id: row.order_id != null ? String(row.order_id) : null,
      },
    };
  });

  const unitHits: GlobalSearchResult[] = units.rows.map((row) => {
    const id = Number(row.id);
    const serial = String(row.serial_number || row.normalized_serial || '').trim();
    return {
      id,
      entityType: 'unit' as const,
      title: serial || `Unit #${id}`,
      subtitle: [`U-${id}`, row.sku].filter(Boolean).join(' · '),
      href: searchHitHref('SERIAL_UNIT', id),
      matchField: 'id',
      facets: {
        status: row.current_status != null ? String(row.current_status) : null,
        serial_number: serial || null,
      },
    };
  });

  return [...receivingHits, ...orderHits, ...unitHits].slice(0, limit);
}

/**
 * Axis-scoped searchers. Header Internal ID never fans out. Callers that
 * omit `axis` (hybrid exact arm, CommandBar) keep the cross-entity bypass.
 * A printed QR / handle always resolves as Internal ID — same decode as
 * the station scan bar — so a carton Digital Link is never ILIKE'd as text.
 */
export async function searchAllEntities(
  orgId: OrgId,
  query: string,
  limit: number,
  axis?: SearchByScope,
): Promise<GlobalSearchResult[]> {
  const startedAt = Date.now();
  const printed = isPrintedHandlePayload(query);
  const branch =
    printed || axis === 'internal'
      ? 'internal'
      : axis === 'ticket'
        ? 'ticket'
        : axis === 'order'
          ? 'order'
          : axis === 'serial'
            ? 'serial'
            : axis === 'tracking'
              ? 'tracking'
              : 'fanout';
  const finish = (rows: GlobalSearchResult[]) => {
    // #region agent log
    fetch('http://127.0.0.1:7905/ingest/963a9b6c-b9e1-4ea4-8873-db315c94d962',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'05d676'},body:JSON.stringify({sessionId:'05d676',hypothesisId:'C,D',location:'global-entity-search.ts:searchAllEntities',message:'searchAllEntities finished',data:{branch,axis:axis ?? null,printed,qLen:query.length,limit,rowCount:rows.length,ms:Date.now()-startedAt},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return rows;
  };
  if (printed || axis === 'internal') {
    return searchInternalIds(orgId, query, limit).catch(() => []).then(finish);
  }
  if (axis === 'ticket') {
    const [tickets, repairs] = await Promise.all([
      searchSupportTickets(orgId, query).catch(() => []),
      searchRepairs(orgId, query, limit).catch(() => []),
    ]);
    return finish([...tickets, ...repairs].slice(0, limit));
  }
  if (axis === 'order') {
    return finish(await searchOrders(orgId, query, limit).catch(() => []));
  }
  if (axis === 'serial') {
    return finish(await searchSerialUnits(orgId, query, limit).catch(() => []));
  }
  if (axis === 'tracking') {
    const [orders, holds] = await Promise.all([
      searchOrders(orgId, query, limit).catch(() => []),
      searchTrackingHolds(orgId, query, limit).catch(() => []),
    ]);
    return finish([...holds, ...orders].slice(0, limit));
  }
  if (looksLikeTicketScan(query)) {
    const tickets = await searchSupportTickets(orgId, query).catch(() => []);
    if (tickets.length > 0) return finish(tickets.slice(0, limit));
  }
  const perEntity = Math.ceil(limit / 7);
  const [orders, repairs, fba, receiving, skus, units, holds] = await Promise.all([
    searchOrders(orgId, query, perEntity).catch(() => []),
    searchRepairs(orgId, query, perEntity).catch(() => []),
    searchFba(orgId, query, perEntity).catch(() => []),
    searchReceiving(orgId, query, perEntity).catch(() => []),
    searchSkus(orgId, query, perEntity).catch(() => []),
    searchSerialUnits(orgId, query, perEntity).catch(() => []),
    searchTrackingHolds(orgId, query, perEntity).catch(() => []),
  ]);
  return finish([...orders, ...holds, ...repairs, ...fba, ...receiving, ...skus, ...units].slice(0, limit));
}
