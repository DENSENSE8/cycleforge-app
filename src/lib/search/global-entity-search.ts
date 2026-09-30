/** global-entity-search — per-entity exact/ILIKE searchers extracted from src/app/api/global-search/route.ts (AI search Phase 0) so the… */

import { tenantQueryOneTrip } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { looksLikeTicketScan } from '@/lib/support/ticket-scan';
import { searchSupportTickets } from '@/lib/search/support-ticket-search';
import { looksLikeIdentifier, searchHitHref, skuRecordHref, toteRecordHref } from '@/lib/search/search-hit';
import {
  receivingOrderIdFromParts,
  receivingSearchTitle,
} from '@/lib/search/receiving-search-title';
import { orderTrackingMatchKeys } from '@/lib/tracking-format';
import {
  sqlTrackingNumberMatches,
} from '@/lib/search/order-tracking-match-sql';
import type { SearchByScope } from '@/lib/search/search-by';
import { sqlIdentifierEqualsQuery } from '@/lib/search/order-number-match';
import {
  hasInternalIdKeys,
  parseInternalIdQuery,
} from '@/lib/search/internal-id';
import { routeScan } from '@/lib/barcode-routing';
import { formatSearchSel } from '@/lib/search/search-selection';
import { parseRepairChannel, REPAIR_CHANNEL_PARAM } from '@/lib/repair/repair-channel';
import { isRepairClosed, repairStatusOperatorLabel, repairTabForStatus } from '@/lib/repair-status';
import { formatRepairPaperTicketNumber } from '@/lib/repair/repair-paper-ticket';
import { formatDateKeyShort, toPSTDateKey } from '@/utils/date';
import { resolveSkuIdentityTitle, skuCatalogJoinOnSql } from '@/lib/sku/sku-identity-law';
import { sentenceCaseLabel } from '@/lib/text/sentence-case-label';

/** Match `serial_units.normalized_serial` (trim + upper) without pulling neon queries. */
function normalizeSerialQuery(raw: string): string {
  return String(raw || '').trim().toUpperCase();
}

export interface GlobalSearchResult {
  id: number;
  /** Fan-out vocabulary. */
  entityType:
    | 'order'
    | 'repair'
    | 'fba'
    | 'receiving'
    | 'sku'
    | 'unit'
    | 'warranty'
    | 'ticket'
    | 'location'
    | 'exception'
    | 'import_exception'
    | 'tote';
  title: string;
  subtitle: string;
  href: string;
  matchField: string;
  /** Optional facet bag — same keys as doc-arm SearchHit.facets. */
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
    /** Buyer identity (orders) — the chat's answer header leads with it. */
    customer_name?: string | null;
    customer_email?: string | null;
    customer_phone?: string | null;
    /** A repair's drop-off carton (`R-{id}`) when its ticket landed one. */
    receiving_handle?: string | null;
  };
}

const ORDER_SEARCH_SELECT = `SELECT o.id,
            o.order_id,
            o.item_number,
            o.product_title,
            o.sku,
            o.account_source,
            o.status,
            BOOL_OR(
              COALESCE(stn.is_delivered, false)
              OR COALESCE(stn_link.is_delivered, false)
              OR UPPER(COALESCE(stn.latest_status_category, '')) = 'DELIVERED'
              OR UPPER(COALESCE(stn_link.latest_status_category, '')) = 'DELIVERED'
            ) AS carrier_delivered,
            o.condition,
            o.order_date,
            o.created_at,
            COALESCE(STRING_AGG(DISTINCT tsn.serial_number, ', '), '') AS serial_number,
            COALESCE(MAX(stn.tracking_number_raw), MAX(stn_link.tracking_number_raw)) AS tracking_number,
            COALESCE(MAX(NULLIF(stn.carrier, 'UNKNOWN')), MAX(NULLIF(stn_link.carrier, 'UNKNOWN'))) AS carrier,
            -- Buyer identity, aggregated rather than grouped: the customers
            -- table is 1:1 on orders.customer_id, so MAX() is the value itself
            -- and every existing GROUP BY o.id in this file stays correct
            -- without being touched.
            MAX(COALESCE(c.display_name, c.customer_name)) AS customer_name,
            MAX(c.email) AS customer_email,
            MAX(COALESCE(NULLIF(btrim(c.phone), ''), c.mobile)) AS customer_phone
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
     LEFT JOIN customers c
       ON c.id = o.customer_id
      AND c.organization_id = o.organization_id
     LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
     LEFT JOIN shipment_links sl
       ON sl.owner_type = 'ORDER'
      AND sl.owner_id = o.id
      AND sl.organization_id = o.organization_id
     LEFT JOIN shipping_tracking_numbers stn_link ON stn_link.id = sl.shipment_id`;

function mapOrderSearchRows(rows: any[]): GlobalSearchResult[] {
  return rows.map((row: any) => {
    const serial = String(row.serial_number || '').trim() || null;
    const happened =
      row.order_date || row.created_at
        ? new Date(row.order_date || row.created_at).toISOString()
        : null;
    return {
      id: Number(row.id),
      entityType: 'order' as const,
      title: String(row.product_title || `Order #${row.id}`),
      // Customer leads: a support call opens with a person's name, so that is
      // what tells the operator "this is the row" without opening it.
      subtitle: [row.customer_name, row.order_id, row.item_number, row.serial_number, row.sku, row.account_source]
        .filter(Boolean)
        .join(' · '),
      // Search feedback shell — kept in sync with searchHitHref('ORDER').
      href: searchHitHref('ORDER', Number(row.id)),
      matchField: 'order',
      facets: {
        status: orderSearchDisplayStatus(row),
        condition_grade: row.condition != null ? String(row.condition) : null,
        source_platform: row.account_source != null ? String(row.account_source) : null,
        tracking_number: row.tracking_number != null ? String(row.tracking_number) : null,
        carrier: row.carrier != null ? String(row.carrier) : null,
        // Exact path aggregates serials; only emit a single serial for the chip.
        serial_number: serial && !serial.includes(',') ? serial : null,
        order_id: row.order_id != null ? String(row.order_id) : null,
        happened_at: happened,
        customer_name: row.customer_name != null ? String(row.customer_name) : null,
        customer_email: row.customer_email != null ? String(row.customer_email) : null,
        customer_phone: row.customer_phone != null ? String(row.customer_phone) : null,
      },
    };
  });
}

/** Carrier truth outranks the stale internal workflow status in search faces. */
export function orderSearchDisplayStatus(row: {
  status?: unknown;
  carrier_delivered?: unknown;
}): string | null {
  if (row.carrier_delivered === true) return 'delivered';
  return row.status != null ? String(row.status) : null;
}

/** A phone typed or pasted any way → its last 10 digits; '' when the query is not phone-shaped. */
function phoneSearchKey(query: string): string {
  const digits = query.replace(/\D/g, '');
  return /^\+?[\d\s().-]{10,24}$/.test(query.trim()) && digits.length >= 10 && digits.length <= 15
    ? digits.slice(-10)
    : '';
}

/** True when the paste is long enough / shaped enough to try tracking → order. */
export function looksLikeTrackingIdentifier(
  query: string,
  last8: string,
  keys: { exact: string; key18: string },
): boolean {
  const q = query.trim().replace(/[\u2010-\u2015\u2212]/g, '-');
  // Dashed marketplace order #s are never carrier tracking.
  if (/^\d{2}-\d{4,}-\d{4,}$/.test(q)) return false;
  if (/^\d{3}-\d{7}-\d{7}$/.test(q)) return false;
  if (/^1Z[A-Z0-9]/i.test(q)) return true;
  if (keys.key18) return true;
  // FedEx / USPS / raw tracking — short Ecwid ids like `5006` stay out.
  if (last8 && q.length >= 10) return true;
  if (keys.exact.length >= 10) return true;
  return false;
}

async function searchOrders(orgId: OrgId, query: string, limit: number): Promise<GlobalSearchResult[]> {
  // Marketplace order # / item number / tracking identifier:
  const identifier = looksLikeIdentifier(query);
  const digits = query.replace(/\D/g, '');
  const last8 = digits.length >= 8 ? digits.slice(-8) : '';
  const keys = orderTrackingMatchKeys(query);
  const like = identifier ? query : `%${query}%`;
  const orderNumberExact = sqlIdentifierEqualsQuery('o.order_id', '$2');
  const itemNumberExact = sqlIdentifierEqualsQuery('o.item_number', '$2');

  // A buyer's phone, typed or pasted any way ("(714) 596-6888", "+1 714…"):
  // matched on its last 10 digits against the customer's phone / mobile. A
  // 10–15 digit run may equally be a tracking or order number, so a phone
  // miss falls through to those arms.
  const phone = phoneSearchKey(query);
  if (phone) {
    const byPhone = await tenantQueryOneTrip(
      orgId,
      `${ORDER_SEARCH_SELECT}
     WHERE o.organization_id = $1
       AND o.customer_id IN (
             SELECT pc.id FROM customers pc
              WHERE pc.organization_id = $1
                AND (right(regexp_replace(coalesce(pc.phone, ''), '\\D', '', 'g'), 10) = $2
                  OR right(regexp_replace(coalesce(pc.mobile, ''), '\\D', '', 'g'), 10) = $2))
     GROUP BY o.id
     ORDER BY o.created_at DESC NULLS LAST
     LIMIT $3`,
      [orgId, phone, limit],
    );
    const phoneHits = mapOrderSearchRows(byPhone.rows);
    if (phoneHits.length > 0) return phoneHits;
  }
  if (identifier) {
    const byNumberPromise = tenantQueryOneTrip(
      orgId,
      `${ORDER_SEARCH_SELECT}
     WHERE o.organization_id = $1
       AND (${orderNumberExact} OR ${itemNumberExact})
     GROUP BY o.id
     ORDER BY o.created_at DESC NULLS LAST
     LIMIT $3`,
      [orgId, query, limit],
    );

    // STN-first: resolve matching shipment ids, then join to orders. Cheap for
    // carrier ids; never correlated from every order row. Independent of the
    // number statement, so it runs alongside it instead of after it.
    const byTrackingPromise = looksLikeTrackingIdentifier(query, last8, keys)
      ? tenantQueryOneTrip(
          orgId,
          `${ORDER_SEARCH_SELECT}
     WHERE o.organization_id = $1
       AND (
            o.shipment_id IN (
              SELECT stn_trk.id
              FROM shipping_tracking_numbers stn_trk
              WHERE ${sqlTrackingNumberMatches({
                stnAlias: 'stn_trk',
                likeParam: '$2',
                canonicalParam: '$3',
                key18Param: '$4',
                last8Param: '$5',
              })}
            )
         OR EXISTS (
              SELECT 1
              FROM shipment_links sl_trk
              JOIN shipping_tracking_numbers stn_trk ON stn_trk.id = sl_trk.shipment_id
              WHERE sl_trk.owner_type = 'ORDER'
                AND sl_trk.owner_id = o.id
                AND sl_trk.organization_id = o.organization_id
                AND ${sqlTrackingNumberMatches({
                  stnAlias: 'stn_trk',
                  likeParam: '$2',
                  canonicalParam: '$3',
                  key18Param: '$4',
                  last8Param: '$5',
                })}
            )
       )
     GROUP BY o.id
     ORDER BY o.created_at DESC NULLS LAST
     LIMIT $6`,
          [orgId, like, keys.exact, keys.key18, last8, limit],
        )
      : null;
    // A full page of number hits never reads the tracking statement; its failure
    // must not surface as an unhandled rejection.
    byTrackingPromise?.catch(() => {});

    const numberHits = mapOrderSearchRows((await byNumberPromise).rows);
    if (numberHits.length >= limit || !byTrackingPromise) {
      return numberHits.slice(0, limit);
    }

    const byTracking = await byTrackingPromise;
    const seen = new Set(numberHits.map((h) => h.id));
    const merged = [...numberHits];
    for (const hit of mapOrderSearchRows(byTracking.rows)) {
      if (seen.has(hit.id)) continue;
      seen.add(hit.id);
      merged.push(hit);
      if (merged.length >= limit) break;
    }
    return merged;
  }

  // Buyer identity is matched here as well as in the index, so a support call can be answered from a name the moment this ships rather than…
  const broadMatch = `(
            o.order_id ILIKE $2
         OR o.item_number ILIKE $2
         OR o.product_title ILIKE $2
         OR o.sku ILIKE $2
         OR tsn.serial_number ILIKE $2
         OR c.display_name ILIKE $2
         OR c.customer_name ILIKE $2
         OR c.email ILIKE $2
  )`;
  const result = await tenantQueryOneTrip(
    orgId,
    `${ORDER_SEARCH_SELECT}
     WHERE o.organization_id = $1
       AND ${broadMatch}
     GROUP BY o.id
     ORDER BY o.created_at DESC NULLS LAST
     LIMIT $3`,
    [orgId, like, limit],
  );

  return mapOrderSearchRows(result.rows);
}

/** `RS-{id}` / `RS{id}` → the ticket id the handle names; null for anything else. */
function repairIdFromHandle(query: string): number | null {
  const m = /^RS-?0*(\d{1,9})$/i.exec(query.trim());
  const id = m ? Number(m[1]) : NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * What finds a repair: ticket # (with or without `#`), `RS-{id}`, the bare id,
 * device title, serial, the customer's name (contact line or linked customer),
 * and a phone's last 10 digits. Placeholders are the caller's so the receiving
 * arm can reuse the same rule over its own aliases.
 */
function repairMatchSql(
  p: { like: string; raw: string; phone: string; rsId: string },
  alias: { repair: string; customer: string } = { repair: 'r', customer: 'c' },
): string {
  const r = alias.repair;
  const c = alias.customer;
  return `(${r}.ticket_number ILIKE ${p.like}
        OR ltrim(btrim(${r}.ticket_number), '#') = ltrim(btrim(${p.raw}), '#')
        OR ${r}.product_title ILIKE ${p.like}
        OR ${r}.serial_number ILIKE ${p.like}
        OR CAST(${r}.id AS TEXT) = ${p.raw}
        OR ${r}.id = ${p.rsId}::int
        OR ${r}.contact_info ILIKE ${p.like}
        OR ${c}.customer_name ILIKE ${p.like}
        OR ${c}.display_name ILIKE ${p.like}
        OR (${p.phone} <> '' AND (
             regexp_replace(coalesce(${r}.contact_info, ''), '\\D', '', 'g') LIKE '%' || ${p.phone} || '%'
          OR right(regexp_replace(coalesce(${c}.phone, ''), '\\D', '', 'g'), 10) = ${p.phone}
          OR right(regexp_replace(coalesce(${c}.mobile, ''), '\\D', '', 'g'), 10) = ${p.phone})))`;
}

/** A repair row as both repair searchers select it — with its customer, drop-off carton and SLA. */
const REPAIR_SEARCH_SELECT = `SELECT r.id, r.ticket_number, r.product_title, r.serial_number, r.status, r.intake_channel,
            r.due_at,
            COALESCE(c.display_name, c.customer_name) AS customer_name,
            rl.receiving_id
     FROM repair_service r
     LEFT JOIN customers c
       ON c.id = r.customer_id AND c.organization_id = r.organization_id
     LEFT JOIN receiving_line rl
       ON rl.id = r.receiving_line_id AND rl.organization_id = r.organization_id`;

type RepairSearchRow = {
  id: number;
  ticket_number: string | null;
  product_title: string | null;
  serial_number: string | null;
  status: string | null;
  intake_channel: string | null;
  due_at: Date | string | null;
  customer_name: string | null;
  receiving_id: number | null;
}

/** "#10089 · Ana Ruiz · In repair · due Oct 2" — the internal RS- code never shows (it still finds the ticket). */
function mapRepairSearchRow(row: RepairSearchRow, href: string): GlobalSearchResult {
  const receivingHandle = row.receiving_id != null ? `R-${row.receiving_id}` : null;
  const dueKey = row.due_at && !isRepairClosed(row.status) ? toPSTDateKey(row.due_at) : '';
  return {
    id: Number(row.id),
    entityType: 'repair' as const,
    title: String(row.product_title || `Repair #${row.id}`),
    subtitle: [
      formatRepairPaperTicketNumber(row.ticket_number) || null,
      row.customer_name,
      row.status ? repairStatusOperatorLabel(row.status) : null,
      dueKey ? `due ${formatDateKeyShort(dueKey)}` : null,
    ]
      .filter(Boolean)
      .join(' · '),
    href,
    matchField: 'repair',
    facets: {
      status: row.status != null ? String(row.status) : null,
      serial_number: row.serial_number != null ? String(row.serial_number) : null,
      customer_name: row.customer_name != null ? String(row.customer_name) : null,
      receiving_handle: receivingHandle,
    },
  };
}

/** The repair searcher's statement — "#10063" and "10063" name the same ticket; a phone reaches it through its contact line or customer. */
export function buildRepairSearchSql(
  orgId: OrgId,
  query: string,
  limit: number,
): { text: string; params: unknown[] } {
  return {
    text: `${REPAIR_SEARCH_SELECT}
     WHERE r.organization_id = $4
       AND ${repairMatchSql({ like: '$1', raw: '$2', phone: '$5', rsId: '$6' })}
     ORDER BY r.created_at DESC NULLS LAST
     LIMIT $3`,
    params: [`%${query}%`, query, limit, orgId, phoneSearchKey(query), repairIdFromHandle(query)],
  };
}

async function searchRepairs(orgId: OrgId, query: string, limit: number): Promise<GlobalSearchResult[]> {
  const { text, params } = buildRepairSearchSql(orgId, query, limit);
  const result = await tenantQueryOneTrip<RepairSearchRow>(orgId, text, params);
  // Land on the ticket's own view (Shipped in · Dropped off; All when it has no channel) and the Status list that carries it, so its card is behind the record.
  return result.rows.map((row) => {
    const channel = parseRepairChannel(row.intake_channel);
    return mapRepairSearchRow(
      row,
      `/repair?tab=${repairTabForStatus(row.status)}${channel ? `&${REPAIR_CHANNEL_PARAM}=${channel}` : ''}&openRepair=${row.id}`,
    );
  });
}

async function searchFba(orgId: OrgId, query: string, limit: number): Promise<GlobalSearchResult[]> {
  const result = await tenantQueryOneTrip(
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

/**
 * The carton a drop-off ticket landed as, found by anything that finds the
 * ticket (`repairMatchSql`) — so a ticket #, `RS-{id}`, customer or serial
 * reaches the repair AND its `R-{id}`. Uncorrelated: the org's matching
 * tickets are resolved once, not per carton.
 */
function cartonOfLinkedRepairSql(org: string, p: Parameters<typeof repairMatchSql>[0]): string {
  return `r.id IN (
              SELECT rrl.receiving_id
                FROM repair_service rs
                JOIN receiving_line rrl
                  ON rrl.id = rs.receiving_line_id AND rrl.organization_id = rs.organization_id
                LEFT JOIN customers rc
                  ON rc.id = rs.customer_id AND rc.organization_id = rs.organization_id
               WHERE rs.organization_id = ${org}
                 AND rs.receiving_line_id IS NOT NULL
                 AND rrl.receiving_id IS NOT NULL
                 AND ${repairMatchSql(p, { repair: 'rs', customer: 'rc' })}
            )`;
}

/**
 * The receiving searcher's statement. Every branch binds EXACTLY the
 * placeholders its text references: node-pg sends parameters untyped, so an
 * unreferenced `$n` fails the whole query ("could not determine data type of
 * parameter $n") — the identifier path used to pass the tracking-normalized
 * key to the order-number branch that never reads it.
 */
export function buildReceivingSearchSql(
  orgId: OrgId,
  query: string,
  limit: number,
): { text: string; params: unknown[] } {
  // Join shipping_tracking_numbers so search matches rows reachable only via receiving.shipment_id (post inbound-tracking unification).
  const identifier = looksLikeIdentifier(query);
  const normalizedQuery = query.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const digits = query.replace(/\D/g, '');
  const last8 = digits.length >= 8 ? digits.slice(-8) : '';
  const trackKeys = orderTrackingMatchKeys(query);
  const trackingShaped = looksLikeTrackingIdentifier(query, last8, trackKeys);

  const selectSql = `SELECT r.id,
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
            lines.first_item_name,
            lines.line_source_order_id
     FROM receiving_carton r
     LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS line_count,
              COUNT(DISTINCT COALESCE(NULLIF(TRIM(rl.sku), ''), NULLIF(TRIM(rl.item_name), ''), rl.id::text))::int
                AS distinct_sku_count,
              (ARRAY_AGG(rl.item_name ORDER BY rl.id)
                FILTER (WHERE NULLIF(TRIM(rl.item_name), '') IS NOT NULL))[1] AS first_item_name,
              (ARRAY_AGG(rl.source_order_id ORDER BY rl.id)
                FILTER (WHERE NULLIF(TRIM(rl.source_order_id), '') IS NOT NULL))[1] AS line_source_order_id
       FROM receiving_line rl WHERE rl.receiving_id = r.id
     ) lines ON TRUE`;

  if (identifier && trackingShaped) {
    // Params: $1=query $2=normalized $3=limit $4=org $5=like $6=phone $7=RS id.
    // Tracking pastes must not OR into the per-carton line EXISTS (timeout); the
    // linked-ticket arm is one hashed subplan over the org's tickets, and a
    // serial or `RS-{id}` often reads as tracking-shaped.
    const q = '$1';
    const norm = '$2';
    const cartonTrackingMatch = `(
            stn.tracking_number_raw = ${q}
         OR stn.tracking_number_normalized = ${norm}
         OR (${norm} <> '' AND regexp_replace(UPPER(COALESCE(stn.tracking_number_normalized, '')), '[^A-Z0-9]', '', 'g') = ${norm})
         OR (
              length(regexp_replace(${q}, '[^0-9]', '', 'g')) >= 8
              AND RIGHT(regexp_replace(COALESCE(stn.tracking_number_normalized, ''), '[^0-9]', '', 'g'), 8)
                = RIGHT(regexp_replace(${q}, '[^0-9]', '', 'g'), 8)
            )
         OR ${cartonOfLinkedRepairSql('$4', { like: '$5', raw: q, phone: '$6', rsId: '$7' })}
    )`;
    return {
      text: `${selectSql}
     WHERE r.organization_id = $4
       AND ${cartonTrackingMatch}
     ORDER BY r.id DESC
     LIMIT $3`,
      params: [query, normalizedQuery, limit, orgId, `%${query}%`, phoneSearchKey(query), repairIdFromHandle(query)],
    };
  }

  if (identifier) {
    // Params: $1=query $2=limit $3=org — the normalized key is a tracking-only input.
    const q = '$1';
    const lineOrderMatch = sqlIdentifierEqualsQuery('rl.source_order_id', q);
    const linkOrderMatch = sqlIdentifierEqualsQuery('l.source_order_id', q);
    const cartonOrderMatch = `(
            ${sqlIdentifierEqualsQuery('r.source_order_id', q)}
         OR ${sqlIdentifierEqualsQuery('r.zoho_purchaseorder_number', q)}
         OR EXISTS (
              SELECT 1 FROM receiving_line rl
              WHERE rl.receiving_id = r.id
                AND rl.organization_id = r.organization_id
                AND ${lineOrderMatch}
            )
         OR EXISTS (
              SELECT 1
              FROM inbound_purchase_order_links l
              JOIN receiving_line rl ON rl.id = l.receiving_line_id
               AND rl.organization_id = l.organization_id
              WHERE rl.receiving_id = r.id
                AND l.organization_id = r.organization_id
                AND ${linkOrderMatch}
            )
         OR ${cartonOfLinkedRepairSql('$3', { like: '$4', raw: q, phone: '$5', rsId: '$6' })}
    )`;
    return {
      text: `${selectSql}
     WHERE r.organization_id = $3
       AND ${cartonOrderMatch}
     ORDER BY r.id DESC
     LIMIT $2`,
      params: [query, limit, orgId, `%${query}%`, phoneSearchKey(query), repairIdFromHandle(query)],
    };
  }

  const broadMatch = `(
            stn.tracking_number_raw ILIKE $1
         OR stn.tracking_number_normalized = $3
         OR CAST(r.id AS TEXT) = $2
         OR r.zoho_purchaseorder_number ILIKE $1
         OR r.source_order_id ILIKE $1
         OR ($3 <> '' AND regexp_replace(UPPER(COALESCE(r.zoho_purchaseorder_number, '')), '[^A-Z0-9]', '', 'g') = $3)
         OR ($3 <> '' AND regexp_replace(UPPER(COALESCE(r.source_order_id, '')), '[^A-Z0-9]', '', 'g') = $3)
         OR EXISTS (
              SELECT 1 FROM receiving_line rl
              WHERE rl.receiving_id = r.id
                AND rl.organization_id = r.organization_id
                AND (rl.source_order_id ILIKE $1
                  OR ($3 <> '' AND regexp_replace(UPPER(COALESCE(rl.source_order_id, '')), '[^A-Z0-9]', '', 'g') = $3))
            )
         OR EXISTS (
              SELECT 1
              FROM inbound_purchase_order_links l
              JOIN receiving_line rl ON rl.id = l.receiving_line_id
               AND rl.organization_id = l.organization_id
              WHERE rl.receiving_id = r.id
                AND l.organization_id = r.organization_id
                AND (l.source_order_id ILIKE $1
                  OR ($3 <> '' AND regexp_replace(UPPER(COALESCE(l.source_order_id, '')), '[^A-Z0-9]', '', 'g') = $3))
            )
         OR ${cartonOfLinkedRepairSql('$5', { like: '$1', raw: '$2', phone: '$6', rsId: '$7' })}
    )`;
  return {
    text: `${selectSql}
     WHERE r.organization_id = $5
       AND ${broadMatch}
     ORDER BY r.id DESC
     LIMIT $4`,
    params: [`%${query}%`, query, normalizedQuery, limit, orgId, phoneSearchKey(query), repairIdFromHandle(query)],
  };
}

async function searchReceiving(orgId: OrgId, query: string, limit: number): Promise<GlobalSearchResult[]> {
  const { text, params } = buildReceivingSearchSql(orgId, query, limit);
  const result = await tenantQueryOneTrip(orgId, text, params);

  return result.rows.map((row: any) => {
    const poNumber = row.po_number != null ? String(row.po_number) : null;
    const sourceOrderId =
      (row.source_order_id != null && String(row.source_order_id).trim()) ||
      (row.line_source_order_id != null && String(row.line_source_order_id).trim()) ||
      null;
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

/**
 * A SKU by its code or title. The SKU is whatever the org stocks OR catalogs:
 * `sku_stock` holds bin-sheet / provisional SKUs (`TMP-…`) that have no active
 * catalog row, so both tables feed the candidates. Title is the identity law's
 * ladder (catalog → Zoho item → the stock row's own text → the SKU); the hit
 * opens the SKU record (`/inventory?sku=`, SkuDetailView). `id` is the catalog
 * row's (the doc index keys SKU hits on it); a stock-only SKU uses its
 * `sku_stock` id.
 */
async function searchSkus(orgId: OrgId, query: string, limit: number): Promise<GlobalSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const result = await tenantQueryOneTrip<{
    sku: string;
    catalog_id: number | null;
    catalog_product_title: string | null;
    zoho_item_title: string | null;
    zoho_item_id: string | null;
    stock_id: number | null;
    stock_title: string | null;
    stock: number | null;
    location: string | null;
  }>(
    orgId,
    `WITH hit AS (
       SELECT sku, organization_id FROM sku_catalog
        WHERE organization_id = $1 AND is_active = true
          AND (sku ILIKE $2 OR product_title ILIKE $2)
       UNION
       SELECT sku, organization_id FROM sku_stock
        WHERE organization_id = $1
          AND (sku ILIKE $2 OR product_title ILIKE $2)
     )
     SELECT h.sku,
            sc.id            AS catalog_id,
            sc.product_title AS catalog_product_title,
            zi.name          AS zoho_item_title,
            zi.zoho_item_id  AS zoho_item_id,
            ss.id            AS stock_id,
            ss.product_title AS stock_title,
            ss.stock,
            ss.location
       FROM hit h
       LEFT JOIN sku_catalog sc ON ${skuCatalogJoinOnSql('h')}
       LEFT JOIN LATERAL (
         SELECT s.id, s.product_title, s.stock, s.location
           FROM sku_stock s
          WHERE s.sku = h.sku AND s.organization_id = h.organization_id
          ORDER BY s.id
          LIMIT 1
       ) ss ON TRUE
       LEFT JOIN LATERAL (
         SELECT i.name, i.zoho_item_id
           FROM items i
          WHERE i.sku = h.sku AND i.organization_id = h.organization_id AND i.status = 'active'
          ORDER BY i.zoho_item_id
          LIMIT 1
       ) zi ON TRUE
      ORDER BY CASE WHEN upper(h.sku) = upper($3) THEN 0
                    WHEN h.sku ILIKE $4 THEN 1
                    ELSE 2 END,
               h.sku
      LIMIT $5`,
    [orgId, `%${q}%`, q, `${q}%`, limit],
  );

  return result.rows.flatMap((row) => {
    const id = Number(row.catalog_id ?? row.stock_id);
    if (!Number.isSafeInteger(id) || id <= 0) return [];
    const sku = String(row.sku);
    const title = resolveSkuIdentityTitle({
      catalog_product_title: row.catalog_product_title,
      zoho_item_title: row.zoho_item_title,
      item_name: row.stock_title,
      sku,
      zoho_item_id: row.zoho_item_id,
    });
    return [
      {
        id,
        entityType: 'sku' as const,
        title: title || sku,
        subtitle: [
          sku,
          row.stock != null ? `${Number(row.stock)} on hand` : null,
          row.location,
        ]
          .filter(Boolean)
          .join(' · '),
        href: skuRecordHref(sku),
        matchField: 'sku',
      },
    ];
  });
}

/**
 * House totes (`handling_units`): the plate's code exactly (`H-12`, or an
 * external tote barcode) or ids a printed `H-{id}` handle decoded to. The
 * face: code, then status · bin · paired order · unit count.
 */
async function searchTotes(
  orgId: OrgId,
  query: string,
  ids: readonly number[],
  limit: number,
): Promise<GlobalSearchResult[]> {
  const code = query.trim();
  if (!code && ids.length === 0) return [];
  const result = await tenantQueryOneTrip<{
    id: number;
    code: string;
    status: string;
    location_name: string | null;
    paired_order_id: number | null;
    paired_order_number: string | null;
    units: number;
  }>(
    orgId,
    `SELECT hu.id, hu.code, hu.status,
            l.name     AS location_name,
            hu.paired_order_id,
            o.order_id AS paired_order_number,
            (SELECT count(*)::int FROM serial_units su
              WHERE su.organization_id = hu.organization_id
                AND su.handling_unit_id = hu.id) AS units
       FROM handling_units hu
       LEFT JOIN locations l ON l.id = hu.location_id AND l.organization_id = hu.organization_id
       LEFT JOIN orders o ON o.id = hu.paired_order_id AND o.organization_id = hu.organization_id
      WHERE hu.organization_id = $1
        AND (($2 <> '' AND upper(hu.code) = upper($2)) OR hu.id = ANY($3::bigint[]))
      ORDER BY hu.id
      LIMIT $4`,
    [orgId, code, [...ids], limit],
  );
  return result.rows.map((row) => {
    const id = Number(row.id);
    const units = Number(row.units) || 0;
    const order = row.paired_order_number || (row.paired_order_id != null ? `#${row.paired_order_id}` : null);
    return {
      id,
      entityType: 'tote' as const,
      title: String(row.code),
      subtitle: [
        sentenceCaseLabel(String(row.status)),
        row.location_name,
        order ? `Order ${order}` : null,
        `${units} ${units === 1 ? 'unit' : 'units'}`,
      ]
        .filter(Boolean)
        .join(' · '),
      href: toteRecordHref(id),
      matchField: ids.includes(id) ? 'id' : 'code',
      facets: { status: String(row.status) },
    };
  });
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
  const identifier = looksLikeIdentifier(query);
  const result = identifier
    ? await tenantQueryOneTrip(
        orgId,
        `SELECT su.id,
            su.serial_number,
            su.normalized_serial,
            su.sku,
            su.current_status::text AS current_status,
            su.condition_grade
     FROM serial_units su
     WHERE su.organization_id = $3
       AND (
            su.normalized_serial = $1
         OR UPPER(TRIM(su.serial_number)) = $1
         OR ${sqlIdentifierEqualsQuery('su.serial_number', '$2')}
         OR ${sqlIdentifierEqualsQuery('su.normalized_serial', '$2')}
       )
     ORDER BY CASE
                WHEN su.normalized_serial = $1 THEN 0
                WHEN UPPER(TRIM(su.serial_number)) = $1 THEN 0
                ELSE 1
              END,
              su.id DESC
     LIMIT $4`,
        [normalized, query, orgId, limit],
      )
    : await tenantQueryOneTrip(
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
         OR UPPER(TRIM(su.serial_number)) = $2
         OR ${sqlIdentifierEqualsQuery('su.serial_number', '$3')}
         OR ${sqlIdentifierEqualsQuery('su.normalized_serial', '$3')}
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

/** Tech / packer unmatched-tracking holds (`orders_exceptions`) and sheet import holds (`order_import_exceptions`). */
async function searchTrackingHolds(
  orgId: OrgId,
  query: string,
  limit: number,
): Promise<GlobalSearchResult[]> {
  const keys = orderTrackingMatchKeys(query);
  const last8 = /^\d{8}$/.test(keys.last8) ? keys.last8 : '';
  const identifier = looksLikeIdentifier(query);
  const like = identifier ? query : `%${query}%`;

  const [scanHolds, importHolds] = await Promise.all([
    tenantQueryOneTrip(
      orgId,
      `SELECT id, shipping_tracking_number, source_station, staff_name,
              exception_reason, status, created_at
       FROM orders_exceptions
       WHERE organization_id = $1
         AND status = 'open'
         AND (
              ${identifier ? 'shipping_tracking_number = $2' : 'shipping_tracking_number ILIKE $2'}
           OR regexp_replace(UPPER(COALESCE(shipping_tracking_number, '')), '[^A-Z0-9]', '', 'g') = $3
           OR ($4 <> '' AND RIGHT(regexp_replace(UPPER(COALESCE(shipping_tracking_number, '')), '[^A-Z0-9]', '', 'g'), 18) = $4)
           OR ($5 <> '' AND RIGHT(regexp_replace(COALESCE(shipping_tracking_number, ''), '[^0-9]', '', 'g'), 8) = $5)
         )
       ORDER BY updated_at DESC, id DESC
       LIMIT $6`,
      [orgId, like, keys.exact, keys.key18, last8, limit],
    ).catch(() => ({ rows: [] as Array<Record<string, unknown>> })),
    tenantQueryOneTrip(
      orgId,
      `SELECT id, account_order_id, account_source, product_title, tracking,
              reason, status, first_seen_at
       FROM order_import_exceptions
       WHERE organization_id = $1
         AND status = 'open'
         AND ignored_at IS NULL
         AND (
              ${identifier ? '(tracking = $2 OR account_order_id = $2)' : `(
              tracking ILIKE $2
           OR account_order_id ILIKE $2
           OR product_title ILIKE $2
              )`}
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

  let receivingIds = [...keys.receivingIds];
  if (keys.receivingLineIds.length > 0) {
    const lines = await tenantQueryOneTrip(
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
      ? tenantQueryOneTrip(
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
      ? tenantQueryOneTrip(
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
      ? tenantQueryOneTrip(
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

  // H-class LPN — the tote itself first (it opens the tote record), then its
  // membership ("testing fans out units"): the units currently IN the box,
  // each painting on `/search?sel=unit:{id}`.
  const totesPromise =
    keys.handlingUnitIds.length > 0
      ? searchTotes(orgId, '', keys.handlingUnitIds, limit).catch(() => [])
      : Promise.resolve([] as GlobalSearchResult[]);
  const boxUnitsPromise =
    keys.handlingUnitIds.length > 0
      ? tenantQueryOneTrip(
          orgId,
          `SELECT su.id,
                  su.serial_number,
                  su.normalized_serial,
                  su.sku,
                  su.current_status::text AS current_status,
                  su.handling_unit_id
           FROM serial_units su
           WHERE su.organization_id = $1
             AND su.handling_unit_id = ANY($2::bigint[])
           ORDER BY su.id DESC
           LIMIT $3`,
          [orgId, keys.handlingUnitIds, limit],
        ).catch(() => ({ rows: [] as Array<Record<string, unknown>> }))
      : Promise.resolve({ rows: [] as Array<Record<string, unknown>> });

  const [receiving, orders, units, boxUnits, toteHits] = await Promise.all([
    receivingPromise,
    orderPromise,
    unitPromise,
    boxUnitsPromise,
    totesPromise,
  ]);

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

  const boxUnitHits: GlobalSearchResult[] = boxUnits.rows.map((row) => {
    const id = Number(row.id);
    const serial = String(row.serial_number || row.normalized_serial || '').trim();
    const huId = row.handling_unit_id != null ? Number(row.handling_unit_id) : null;
    return {
      id,
      entityType: 'unit' as const,
      title: serial || `Unit #${id}`,
      subtitle: [huId != null ? `H-${huId}` : null, `U-${id}`, row.sku]
        .filter(Boolean)
        .join(' · '),
      href: searchHitHref('SERIAL_UNIT', id),
      matchField: 'handling_unit',
      facets: {
        status: row.current_status != null ? String(row.current_status) : null,
        serial_number: serial || null,
      },
    };
  });

  // A bare number keys every PK at once, so unit #n can arrive both as itself
  // and as a member of box #n — one row per record.
  const merged: GlobalSearchResult[] = [];
  const seenHits = new Set<string>();
  for (const hit of [...toteHits, ...receivingHits, ...orderHits, ...unitHits, ...boxUnitHits]) {
    const key = `${hit.entityType}:${hit.id}`;
    if (seenHits.has(key)) continue;
    seenHits.add(key);
    merged.push(hit);
  }
  return merged.slice(0, limit);
}

/** KIT master label → the kit's member units. */
async function searchManifestUnits(
  orgId: OrgId,
  query: string,
  limit: number,
): Promise<GlobalSearchResult[]> {
  const uid = query.trim();
  if (!/^KIT-/i.test(uid)) return [];
  const result = await tenantQueryOneTrip(
    orgId,
    `SELECT m.manifest_uid,
            m.status AS manifest_status,
            su.id,
            su.serial_number,
            su.normalized_serial,
            su.sku,
            su.current_status::text AS current_status
     FROM label_manifests m
     JOIN label_manifest_items i
       ON i.manifest_id = m.id
      AND i.organization_id = m.organization_id
     JOIN serial_units su
       ON su.id = i.serial_unit_id
      AND su.organization_id = m.organization_id
     WHERE m.organization_id = $1
       AND UPPER(m.manifest_uid) = UPPER($2)
     ORDER BY i.ordinal ASC, i.id ASC
     LIMIT $3`,
    [orgId, uid, limit],
  );

  return result.rows.map((row: any) => {
    const id = Number(row.id);
    const serial = String(row.serial_number || row.normalized_serial || '').trim();
    return {
      id,
      entityType: 'unit' as const,
      title: serial || `Unit #${id}`,
      subtitle: [String(row.manifest_uid), row.manifest_status, row.sku]
        .filter(Boolean)
        .join(' · '),
      href: searchHitHref('SERIAL_UNIT', id),
      matchField: 'manifest',
      facets: {
        status: row.current_status != null ? String(row.current_status) : null,
        serial_number: serial || null,
      },
    };
  });
}

/**
 * Printed REP-{id} label → its repair by pk. Lands on `/search?sel=repair:{id}`
 * — the same surface the ⌘K scan-gun path opens (`desktopSearchHref` of
 * `/m/rs/{id}`) — so typing the sticker and scanning it agree.
 */
async function searchRepairByPk(
  orgId: OrgId,
  repairId: number,
  limit: number,
): Promise<GlobalSearchResult[]> {
  if (!Number.isSafeInteger(repairId) || repairId <= 0) return [];
  const result = await tenantQueryOneTrip<RepairSearchRow>(
    orgId,
    `${REPAIR_SEARCH_SELECT}
     WHERE r.organization_id = $1
       AND r.id = $2
     LIMIT $3`,
    [orgId, repairId, limit],
  );
  return result.rows.map((row) => mapRepairSearchRow(row, `/search?sel=${formatSearchSel('repair', Number(row.id))}`));
}

/** Axis-scoped searchers. */
export async function searchAllEntities(
  orgId: OrgId,
  query: string,
  limit: number,
  axis?: SearchByScope,
): Promise<GlobalSearchResult[]> {
  // One decode for the whole dispatch — same decoder the station scan bar uses.
  const scanRoute = routeScan(query);
  const printed = Boolean(scanRoute?.redirect);
  // Printed classes that are NOT internal PK keys must be routed before the Internal ID branch, which knows no ticket / repair / manifest…
  if (printed && scanRoute?.type === 'support-ticket') {
    const ticketId = /^\/support\?ticket=(\d+)/.exec(scanRoute.redirect ?? '')?.[1];
    const tickets = ticketId
      ? await searchSupportTickets(orgId, ticketId).catch(() => [])
      : [];
    return tickets.slice(0, limit);
  }
  const repairPk = printed
    ? /^\/m\/rs\/(\d+)/.exec(scanRoute?.redirect ?? '')?.[1]
    : undefined;
  if (repairPk) {
    return await searchRepairByPk(orgId, Number(repairPk), limit).catch(() => []);
  }
  if (scanRoute?.type === 'manifest') {
    return await searchManifestUnits(orgId, query, limit).catch(() => []);
  }
  // A bin code decodes as a printed class but is no internal PK key. Only a
  // DECODED bin (it carries a redirect): `routeScan`'s letter-first fallback
  // also says "bin" for any text — "RS-4898", a serial, a customer's name —
  // and must fall through to the record arms (the identifier arms ask bins too).
  if (printed && scanRoute?.type === 'bin') {
    return await searchLocations(orgId, scanRoute.value, limit).catch(() => []);
  }
  if (printed || axis === 'internal') {
    return searchInternalIds(orgId, query, limit).catch(() => []);
  }
  if (axis === 'ticket') {
    const [tickets, repairs] = await Promise.all([
      searchSupportTickets(orgId, query).catch(() => []),
      searchRepairs(orgId, query, limit).catch(() => []),
    ]);
    return [...tickets, ...repairs].slice(0, limit);
  }
  if (axis === 'order') {
    const [orders, receiving] = await Promise.all([
      searchOrders(orgId, query, limit).catch(() => []),
      searchReceiving(orgId, query, limit).catch(() => []),
    ]);
    return [...orders, ...receiving].slice(0, limit);
  }
  if (axis === 'serial') {
    return await searchSerialUnits(orgId, query, limit).catch(() => []);
  }
  if (axis === 'tracking') {
    const [orders, holds] = await Promise.all([
      searchOrders(orgId, query, limit).catch(() => []),
      searchTrackingHolds(orgId, query, limit).catch(() => []),
    ]);
    return [...holds, ...orders].slice(0, limit);
  }
  // A ticket-shaped scan answers with its ticket when one exists. The record
  // arms start alongside the ticket lookup instead of after it; every arm is
  // caught, so the unread arms of a ticket hit cannot reject.
  const ticketLookup = looksLikeTicketScan(query)
    ? searchSupportTickets(orgId, query).catch(() => [])
    : null;
  const records = looksLikeIdentifier(query)
    ? searchIdentifierArms(orgId, query, limit)
    : searchBroadArms(orgId, query, limit);
  if (ticketLookup) {
    const tickets = await ticketLookup;
    if (tickets.length > 0) return tickets.slice(0, limit);
  }
  return records;
}

/** Identifier-shaped query: every parent table, each arm given the whole page. */
async function searchIdentifierArms(
  orgId: OrgId,
  query: string,
  limit: number,
): Promise<GlobalSearchResult[]> {
  // SKU and FBA belong here as much as orders do. A tote plate is an exact
  // code match — the identity answer — so it leads.
  const [totes, orders, units, holds, receiving, skus, fba, repairs, bins] = await Promise.all([
    searchTotes(orgId, query, [], limit).catch(() => []),
    searchOrders(orgId, query, limit).catch(() => []),
    searchSerialUnits(orgId, query, limit).catch(() => []),
    searchTrackingHolds(orgId, query, limit).catch(() => []),
    searchReceiving(orgId, query, limit).catch(() => []),
    searchSkus(orgId, query, limit).catch(() => []),
    searchFba(orgId, query, limit).catch(() => []),
    searchRepairs(orgId, query, limit).catch(() => []),
    searchLocations(orgId, query, limit).catch(() => []),
  ]);
  // Otherwise order stays as it was — exact parent-table hits first — with
  // the new sources appended so nothing that already ranked moves.
  return [
    ...totes,
    ...orders,
    ...receiving,
    ...holds,
    ...units,
    ...skus,
    ...fba,
    ...repairs,
    ...bins,
  ].slice(0, limit);
}

/**
 * A bin code, typed with or without its dashes (`D-04-08-2-00` / `D0408200`):
 * exact on the name or the printed barcode. Bins are not a `/search` record —
 * the hit hands off to Inventory ▸ Locations (`searchHitHref`).
 */
async function searchLocations(orgId: OrgId, query: string, limit: number): Promise<GlobalSearchResult[]> {
  const bare = query.trim().replace(/[\s-]/g, '').toUpperCase();
  if (!bare) return [];
  const result = await tenantQueryOneTrip<{
    id: number;
    name: string | null;
    barcode: string | null;
    room: string | null;
    bin_type: string | null;
  }>(
    orgId,
    `SELECT id, name, barcode, room, bin_type
     FROM locations
     WHERE organization_id = $1
       AND is_active = true
       AND (upper(regexp_replace(name, '[\\s-]', '', 'g')) = $2
        OR upper(regexp_replace(coalesce(barcode, ''), '[\\s-]', '', 'g')) = $2)
     ORDER BY id
     LIMIT $3`,
    [orgId, bare, limit],
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    entityType: 'location' as const,
    title: String(row.name || row.barcode || `Bin #${row.id}`),
    subtitle: [row.barcode, row.room, row.bin_type].filter(Boolean).join(' · '),
    href: searchHitHref('LOCATION', Number(row.id)),
    matchField: 'location',
  }));
}

/** Free-text query: an even share of the page per entity (a tote is an exact code match, so it leads). */
async function searchBroadArms(
  orgId: OrgId,
  query: string,
  limit: number,
): Promise<GlobalSearchResult[]> {
  const perEntity = Math.ceil(limit / 7);
  const [totes, orders, repairs, fba, receiving, skus, units, holds] = await Promise.all([
    searchTotes(orgId, query, [], perEntity).catch(() => []),
    searchOrders(orgId, query, perEntity).catch(() => []),
    searchRepairs(orgId, query, perEntity).catch(() => []),
    searchFba(orgId, query, perEntity).catch(() => []),
    searchReceiving(orgId, query, perEntity).catch(() => []),
    searchSkus(orgId, query, perEntity).catch(() => []),
    searchSerialUnits(orgId, query, perEntity).catch(() => []),
    searchTrackingHolds(orgId, query, perEntity).catch(() => []),
  ]);
  return [...totes, ...orders, ...holds, ...repairs, ...fba, ...receiving, ...skus, ...units].slice(0, limit);
}
