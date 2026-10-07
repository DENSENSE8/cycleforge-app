import 'server-only';
import { documentContentUrl } from '@/lib/documents/display-url';
import { sqlOrderNotBuyerCancelled, sqlOrderOpenUnshipped } from '@/lib/orders/desk-view-sql';
import { WA_DEADLINE_LATERAL } from '@/lib/orders/orders-list';
import { orderPlatformSlugSql, storedListingsSql, toStoredListings } from '@/lib/orders/line-listing-sql';
import { PICKUP_FULFILLMENT_CHANNEL } from '@/lib/orders/release-gates';
import { listingCoverThumbUrlSql } from '@/lib/photos/listing-photos';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { orderTrackingMatchKeys } from '@/lib/tracking-format';
import { buildOrderPacket, orderPacketQueue, type PacketSource, type UnpairedLabelCandidate } from './order-packet-derive';
import { orderPacketQuerySchema, type OrderPacketParsedQuery, type OrderPacketQueue, type PacketLabelDocument } from './order-packet-contracts';
import {
  LABEL_EVENT_OF_INGESTION_SQL,
  labelRowSelectSql,
  paperworkDocsSql,
  toLabelRow,
  toOrderLines,
  toPaperworkDocument,
  type LabelQueueRow,
  type RawOrderLine,
  type RawPaperworkDoc,
} from './print-queue';
import { placedElseImportedSql } from '@/lib/orders/order-dates';

/**
 * Labels & docs › Orders (`GET /api/shipping/label-intake/orders`) — one row
 * per ORDER, shaped as its slots, in ONE statement: the candidate orders, every
 * fact their slots derive from, and the org's unpaired labels (suggestions).
 * Slot states, status, filters, counts, sort and paging are the pure
 * derivation in `order-packet-derive.ts`, so the route and the sidebar facets
 * agree by construction.
 *
 * Candidates (one per order number, keyed by its lowest `orders.id`) are what
 * the old print desk listed: Allocate's open orders (`sqlOrderOpenUnshipped`)
 * ∪ orders holding a stored label never printed. Find (`q`) narrows the
 * candidates in SQL — order number (full or last 8 digits), tracking (shipment
 * or label), SKU, item number, title — so every count is under it.
 *
 * Labels are ledger ingestions paired to any line (`labelRowSelectSql`) plus
 * the order's shipping-label documents; slips and product paperwork come from
 * the paperwork resolution (`paperworkDocsSql`), which attaches a manual to
 * every line it covers. `$1` is the org and every table read is predicated on it.
 */

/** Unpaired labels read for suggestions, newest first. */
const MAX_UNPAIRED_LABELS = 500;

/** Allocate's open orders ∪ orders with a stored label never printed, before grouping. `$2` = Find LIKE, `$3` = Find last-8 digits. */
const PACKET_PRELUDE_CTES = `pk_src AS (
    SELECT o.id, NULL::timestamptz AS observed_at
      FROM orders o
      LEFT JOIN shipping_tracking_numbers stn ON stn.organization_id = $1 AND stn.id = o.shipment_id
     WHERE o.organization_id = $1 AND ${sqlOrderOpenUnshipped('o')} AND ${sqlOrderNotBuyerCancelled('o')}
    UNION ALL
    -- A named selection (\`ids\`) is a packet whatever its stage.
    SELECT o.id, NULL::timestamptz
      FROM orders o
     WHERE o.organization_id = $1 AND $4::int[] IS NOT NULL AND o.id = ANY($4::int[])
    UNION ALL
    SELECT li.matched_order_id, li.observed_at
      FROM label_ingestions li
     WHERE li.organization_id = $1 AND li.staged_object_key IS NOT NULL AND li.matched_order_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM label_print_events e WHERE ${LABEL_EVENT_OF_INGESTION_SQL})
  ),
  pk_group AS (
    SELECT min(g.id) AS order_id, min(s.observed_at) AS observed_at
      FROM pk_src s
      JOIN orders so ON so.organization_id = $1 AND so.id = s.id
      JOIN orders g
        ON g.organization_id = $1
       AND (g.id = so.id OR (NULLIF(so.order_id, '') IS NOT NULL AND g.order_id = so.order_id))
     GROUP BY COALESCE(NULLIF(so.order_id, ''), 'id:' || so.id)
  )`;

const digitsLast8 = (expr: string) => `RIGHT(regexp_replace(COALESCE(${expr}, ''), '[^0-9]', '', 'g'), 8)`;

/** The candidates Find keeps: any line of the order matches. */
const PACKET_CAND_SQL = `SELECT pg.order_id, pg.observed_at, true AS paired
      FROM pk_group pg
     WHERE ($4::int[] IS NULL OR EXISTS (
       SELECT 1
         FROM orders ih
         JOIN orders il
           ON il.organization_id = $1
          AND (il.id = ih.id OR (NULLIF(ih.order_id, '') IS NOT NULL AND il.order_id = ih.order_id))
        WHERE ih.organization_id = $1 AND ih.id = pg.order_id AND il.id = ANY($4::int[])
     ))
       AND ($2::text IS NULL OR EXISTS (
       SELECT 1
         FROM orders qh
         JOIN orders ql
           ON ql.organization_id = $1
          AND (ql.id = qh.id OR (NULLIF(qh.order_id, '') IS NOT NULL AND ql.order_id = qh.order_id))
         LEFT JOIN shipping_tracking_numbers qs ON qs.organization_id = $1 AND qs.id = ql.shipment_id
         LEFT JOIN sku_catalog qc ON qc.organization_id = $1 AND qc.id = ql.sku_catalog_id
        WHERE qh.organization_id = $1 AND qh.id = pg.order_id
          AND (ql.order_id ILIKE $2 OR ql.sku ILIKE $2 OR ql.item_number ILIKE $2 OR ql.product_title ILIKE $2
               OR qc.product_title ILIKE $2 OR qc.sku ILIKE $2 OR qs.tracking_number_raw ILIKE $2
               OR ($3::text IS NOT NULL AND (${digitsLast8('ql.order_id')} = $3 OR ${digitsLast8('qs.tracking_number_normalized')} = $3))
               OR EXISTS (SELECT 1 FROM label_ingestions ql_li
                           WHERE ql_li.organization_id = $1 AND ql_li.matched_order_id = ql.id
                             AND (ql_li.tracking_number_normalized ILIKE $2
                                  OR ($3::text IS NOT NULL AND ${digitsLast8('ql_li.tracking_number_normalized')} = $3))))
     ))`;

/**
 * A line's photo — the order list's ladder (`orders-list.ts`): catalog photo,
 * listing cover, the Ecwid mirror, the order's listing photo, ShipStation's line image.
 */
const LINE_PHOTO_SQL = `COALESCE(
           NULLIF(BTRIM(sc.image_url), ''),
           ${listingCoverThumbUrlSql('sc')},
           (SELECT NULLIF(BTRIM(sp.image_url), '')
              FROM sku_platform_ids sp
             WHERE sp.organization_id = $1 AND sp.platform = 'ecwid' AND sp.is_active = true
               AND NULLIF(BTRIM(sp.image_url), '') IS NOT NULL
               AND (sp.sku_catalog_id = rl.sku_catalog_id OR sp.platform_sku = rl.sku)
             ORDER BY sp.created_at DESC NULLS LAST, sp.id DESC
             LIMIT 1),
           (SELECT COALESCE(
                     (SELECT NULLIF(BTRIM(ps.legacy_url), '') FROM photo_storage ps
                       WHERE ps.organization_id = $1 AND ps.photo_id = pel.photo_id
                         AND ps.provider = 'legacy_url' AND ps.is_primary = TRUE
                       LIMIT 1),
                     '/api/photos/' || pel.photo_id::text || '/content?variant=thumb')
              FROM photo_entity_links pel
              JOIN photos p ON p.organization_id = $1 AND p.id = pel.photo_id
             WHERE pel.organization_id = $1 AND pel.entity_type = 'ORDER' AND pel.entity_id = rl.id
               AND p.photo_type = 'listing'
             ORDER BY p.created_at DESC, p.id DESC
             LIMIT 1),
           (SELECT NULLIF(BTRIM(line.item->>'imageUrl'), '')
              FROM (SELECT ssr.line_items FROM shipstation_order_refs ssr
                     WHERE ssr.organization_id = $1 AND ssr.order_row_id = rl.id
                     ORDER BY ssr.last_seen_at DESC NULLS LAST, ssr.id DESC
                     LIMIT 1) ss
             CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ss.line_items, '[]'::jsonb)) WITH ORDINALITY AS line(item, ordinal)
             WHERE COALESCE(line.item->>'adjustment', 'false') <> 'true'
               AND NULLIF(BTRIM(line.item->>'imageUrl'), '') IS NOT NULL
             ORDER BY CASE WHEN NULLIF(BTRIM(rl.sku), '') IS NOT NULL
                            AND UPPER(BTRIM(line.item->>'sku')) = UPPER(BTRIM(rl.sku)) THEN 0 ELSE 1 END,
                      line.ordinal
             LIMIT 1)
         )`;

/** After the paperwork CTEs: each head's facts, lines, labels, label documents and paperwork; then the unpaired labels. */
const PACKET_TAIL_SQL = `,
  pk_heads AS (
    SELECT h.order_id, h.order_ref, o.account_source, ${orderPlatformSlugSql('o', '$1')} AS platform_slug,
           ${placedElseImportedSql('o')} AS ordered_at, wa_deadline.deadline_at AS ship_by_at,
           COALESCE(o.fulfillment_channel = '${PICKUP_FULFILLMENT_CHANNEL}', false) AS pickup,
           COALESCE(o.docs_not_required, false) AS docs_not_required,
           ARRAY_REMOVE(ARRAY[ss.ship_to->>'name', c.display_name, c.customer_name,
                              NULLIF(btrim(concat_ws(' ', c.first_name, c.last_name)), '')], NULL) AS buyer_names,
           NULLIF(BTRIM(COALESCE(sh.tracking_number_raw, sh.tracking_number_normalized)), '') AS tracking_number,
           NULLIF(NULLIF(BTRIM(sh.carrier), ''), 'UNKNOWN') AS tracking_carrier,
           -- Every box on any line — the primary pointer and the additional ones (shipment_links).
           (SELECT COALESCE(array_agg(DISTINCT t.tn), '{}')
              FROM (SELECT st.tracking_number_normalized AS tn
                      FROM keys tk
                      JOIN orders tl ON tl.organization_id = $1 AND tl.id = tk.line_id
                      JOIN shipping_tracking_numbers st ON st.organization_id = $1 AND st.id = tl.shipment_id
                     WHERE tk.head_id = h.order_id
                    UNION
                    SELECT st.tracking_number_normalized
                      FROM keys tk
                      JOIN shipment_links sl ON sl.organization_id = $1 AND sl.owner_type = 'ORDER' AND sl.owner_id = tk.line_id
                      JOIN shipping_tracking_numbers st ON st.organization_id = $1 AND st.id = sl.shipment_id
                     WHERE tk.head_id = h.order_id) t
             WHERE NULLIF(BTRIM(t.tn), '') IS NOT NULL) AS tracking_numbers
      FROM heads h
      JOIN orders o ON o.organization_id = $1 AND o.id = h.order_id
      ${WA_DEADLINE_LATERAL}
      LEFT JOIN shipping_tracking_numbers sh ON sh.organization_id = $1 AND sh.id = o.shipment_id
      LEFT JOIN customers c ON c.organization_id = $1 AND c.id = o.customer_id
      LEFT JOIN LATERAL (
        SELECT r.ship_to FROM shipstation_order_refs r
         WHERE r.organization_id = $1 AND r.order_row_id = o.id
         ORDER BY r.last_seen_at DESC NULLS LAST, r.id DESC
         LIMIT 1
      ) ss ON true
  ),
  pk_lines AS (
    SELECT k.head_id, json_agg(json_build_object(
             'order_line_id', rl.id,
             'item_number', rl.item_number,
             'sku_catalog_id', k.catalog_id,
             'catalog_title', sc.product_title,
             'product_title', rl.product_title,
             'sku', rl.sku,
             'quantity', CASE WHEN rl.quantity ~ '^[0-9]+$' THEN rl.quantity::int ELSE 1 END,
             'photo_url', ${LINE_PHOTO_SQL},
             'paperwork_not_required', COALESCE(sc.paperwork_not_required, false),
             'docs_not_required', COALESCE(rl.docs_not_required, false),
             'stored_listings', ${storedListingsSql('$1', { itemNumber: 'rl.item_number', skuCatalogId: 'k.catalog_id', sku: 'rl.sku' })}
           ) ORDER BY rl.id) AS lines
      FROM keys k
      JOIN orders rl ON rl.organization_id = $1 AND rl.id = k.line_id
      LEFT JOIN sku_catalog sc ON sc.organization_id = $1 AND sc.id = k.catalog_id
     GROUP BY k.head_id
  ),
  pk_labels AS (
    SELECT k.head_id, json_agg(lr ORDER BY lr.observed_at, lr.id) AS labels
      FROM (${labelRowSelectSql(', li.detected_ship_to_name')}
             WHERE li.organization_id = $1 AND li.staged_object_key IS NOT NULL
               AND li.matched_order_id IN (SELECT line_id FROM keys)) lr
      JOIN keys k ON k.line_id = lr.matched_order_id
     GROUP BY k.head_id
  ),
  pk_label_links AS (
    SELECT dl.document_id, dl.entity_id
      FROM document_entity_links dl
     WHERE dl.organization_id = $1 AND dl.entity_type = 'ORDER' AND dl.entity_id IN (SELECT line_id FROM keys)
    UNION
    SELECT d0.id, d0.entity_id::bigint
      FROM documents d0
     WHERE d0.organization_id = $1 AND d0.document_type = 'shipping_label'
       AND d0.entity_type IN ('ORDER', 'SHIPPING_LABEL') AND d0.entity_id::bigint IN (SELECT line_id FROM keys)
  ),
  pk_label_docs AS (
    SELECT k.head_id, json_agg(json_build_object(
             'document_id', d.id,
             'filename', COALESCE(NULLIF(TRIM(d.document_data->>'filename'), ''), NULLIF(TRIM(d.document_data->>'fileBasename'), '')),
             'tracking', NULLIF(TRIM(d.document_data->>'tracking'), ''),
             'created_at', d.created_at,
             'print_count', lp.print_count,
             'last_printed_at', lp.last_printed_at
           ) ORDER BY d.created_at, d.id) AS label_documents
      FROM (SELECT DISTINCT k0.head_id, ln.document_id FROM pk_label_links ln JOIN keys k0 ON k0.line_id = ln.entity_id) k
      JOIN documents d ON d.organization_id = $1 AND d.id = k.document_id AND d.document_type = 'shipping_label'
      CROSS JOIN LATERAL (
        SELECT count(*)::int AS print_count, max(ev.at) AS last_printed_at
          FROM (
            SELECT e.printed_at AS at
              FROM label_print_events e
             WHERE e.organization_id = $1
               AND (e.document_id = d.id
                    OR e.label_ingestion_id IN (SELECT ai.id FROM label_ingestions ai WHERE ai.organization_id = $1 AND ai.document_id = d.id))
            UNION ALL
            SELECT j.created_at
              FROM document_print_jobs j
             WHERE j.organization_id = $1 AND j.status IN ('dispatched', 'fallback_browser') AND j.document_id = d.id
          ) ev
      ) lp
     GROUP BY k.head_id
  ),
  pk_docs AS (
    SELECT d.head_id, json_agg(json_build_object(
             'kind', d.kind, 'document_id', d.document_id, 'manual_id', d.manual_id, 'title', d.title,
             'source_url', d.source_url, 'sort_at', d.sort_at, 'print_count', d.print_count,
             'last_printed_at', d.last_printed_at, 'association_source', d.association_source,
             'order_line_ids', d.order_line_ids, 'item_number', d.item_number,
             'paired_sku', d.paired_sku, 'sku_catalog_id', d.sku_catalog_id
           ) ORDER BY d.sort_group, d.source_rank, d.sort_at DESC NULLS LAST, COALESCE(d.document_id, d.manual_id) DESC) AS documents
      FROM docs d
     GROUP BY d.head_id
  )
SELECT (SELECT COALESCE(json_agg(json_build_object(
          'order_id', ph.order_id, 'order_ref', ph.order_ref, 'account_source', ph.account_source, 'platform_slug', ph.platform_slug,
          'ordered_at', ph.ordered_at, 'ship_by_at', ph.ship_by_at, 'pickup', ph.pickup,
          'docs_not_required', ph.docs_not_required, 'buyer_names', ph.buyer_names,
          'tracking_number', ph.tracking_number, 'tracking_carrier', ph.tracking_carrier, 'tracking_numbers', ph.tracking_numbers,
          'lines', pl.lines, 'labels', pb.labels, 'label_documents', pd.label_documents, 'documents', pw.documents
        ) ORDER BY ph.order_id), '[]'::json)
          FROM pk_heads ph
          LEFT JOIN pk_lines pl ON pl.head_id = ph.order_id
          LEFT JOIN pk_labels pb ON pb.head_id = ph.order_id
          LEFT JOIN pk_label_docs pd ON pd.head_id = ph.order_id
          LEFT JOIN pk_docs pw ON pw.head_id = ph.order_id) AS packets,
       (SELECT COALESCE(json_agg(u ORDER BY u.observed_at DESC, u.id DESC), '[]'::json)
          FROM (SELECT ul.id, ul.row_version, ul.file_basename, ul.batch_id, ul.page_number,
                       ul.tracking_number_normalized, ul.carrier, ul.observed_at,
                       ul.detected_ship_to_name, ul.matched_marketplace_order_id
                  FROM label_ingestions ul
                 WHERE ul.organization_id = $1 AND ul.matched_order_id IS NULL AND ul.document_id IS NULL
                   AND ul.staged_object_key IS NOT NULL
                 ORDER BY ul.observed_at DESC, ul.id DESC
                 LIMIT ${MAX_UNPAIRED_LABELS}) u) AS unpaired`;

/** The whole Orders statement — exported for the tenancy test and the read-only smoke. */
export const ORDER_PACKETS_SQL = `${paperworkDocsSql(PACKET_CAND_SQL, PACKET_PRELUDE_CTES)}${PACKET_TAIL_SQL}`;

/** The bound values of {@link ORDER_PACKETS_SQL}, in `$n` order: org, Find LIKE, Find last-8 digits, named order rows. */
export function orderPacketsParams(organizationId: OrgId, query: Pick<OrderPacketParsedQuery, 'q' | 'ids'>): unknown[] {
  const q = query.q?.trim() || null;
  const { last8 } = q ? orderTrackingMatchKeys(q) : { last8: '' };
  return [organizationId, q ? `%${q.replace(/[\\%_]/g, '\\$&')}%` : null, /^\d{8}$/.test(last8) ? last8 : null, query.ids?.length ? query.ids : null];
}

interface RawPacketLine extends RawOrderLine {
  photo_url: string | null;
  paperwork_not_required: boolean;
  docs_not_required: boolean;
  stored_listings: unknown;
}

interface RawLabelDocument {
  document_id: number;
  filename: string | null;
  tracking: string | null;
  created_at: string;
  print_count: number;
  last_printed_at: string | null;
}

interface RawPacket {
  order_id: number;
  order_ref: string;
  account_source: string | null;
  platform_slug: string | null;
  ordered_at: string | null;
  ship_by_at: string | null;
  pickup: boolean;
  docs_not_required: boolean;
  buyer_names: string[] | null;
  tracking_number: string | null;
  tracking_carrier: string | null;
  tracking_numbers: string[] | null;
  lines: RawPacketLine[] | null;
  labels: LabelQueueRow[] | null;
  label_documents: RawLabelDocument[] | null;
  documents: RawPaperworkDoc[] | null;
}

interface RawUnpairedLabel {
  id: number;
  row_version: number;
  file_basename: string;
  batch_id: number | null;
  page_number: number | null;
  tracking_number_normalized: string | null;
  carrier: string | null;
  observed_at: string;
  detected_ship_to_name: string | null;
  matched_marketplace_order_id: string | null;
}

const iso = (value: string | null) => (value == null ? null : new Date(value).toISOString());

function toLabelDocument(doc: RawLabelDocument): PacketLabelDocument {
  const id = Number(doc.document_id);
  return {
    key: `doc:${id}`,
    documentId: id,
    title: doc.filename ? `Shipping label · ${doc.filename}` : 'Shipping label',
    src: documentContentUrl(id),
    trackingNumber: doc.tracking,
    createdAt: new Date(doc.created_at).toISOString(),
    printCount: Number(doc.print_count),
    lastPrintedAt: iso(doc.last_printed_at),
  };
}

function toPacketSource(raw: RawPacket): PacketSource {
  const lines = raw.lines ?? [];
  const titled = toOrderLines(lines);
  return {
    orderId: Number(raw.order_id),
    orderRef: raw.order_ref,
    accountSource: raw.account_source,
    platformSlug: raw.platform_slug,
    orderedAt: iso(raw.ordered_at),
    shipByAt: iso(raw.ship_by_at),
    pickup: raw.pickup,
    docsNotRequired: raw.docs_not_required,
    buyerNames: raw.buyer_names ?? [],
    shipment: raw.tracking_number ? { trackingNumber: raw.tracking_number, carrier: raw.tracking_carrier } : null,
    trackingNumbers: raw.tracking_numbers ?? [],
    labelShipTo: (raw.labels ?? []).flatMap((row) =>
      typeof row.detected_ship_to_name === 'string' && row.detected_ship_to_name.trim() ? [{ ingestionId: Number(row.id), name: row.detected_ship_to_name }] : [],
    ),
    labels: (raw.labels ?? []).map(toLabelRow),
    labelDocuments: (raw.label_documents ?? []).map(toLabelDocument),
    documents: (raw.documents ?? []).map(toPaperworkDocument),
    lines: titled.map((line, index) => ({
      ...line,
      photoUrl: lines[index]!.photo_url,
      paperworkNotRequired: lines[index]!.paperwork_not_required,
      docsNotRequired: lines[index]!.docs_not_required,
      storedListings: toStoredListings(lines[index]!.stored_listings),
    })),
  };
}

function toUnpaired(row: RawUnpairedLabel): UnpairedLabelCandidate {
  return {
    ingestionId: Number(row.id),
    rowVersion: Number(row.row_version),
    fileBasename: row.file_basename,
    batchId: row.batch_id == null ? null : Number(row.batch_id),
    pageNumber: row.page_number == null ? null : Number(row.page_number),
    trackingNumber: row.tracking_number_normalized,
    carrier: row.carrier,
    observedAt: new Date(row.observed_at).toISOString(),
    shipToName: row.detected_ship_to_name,
    marketplaceOrderId: row.matched_marketplace_order_id,
  };
}

/** Labels & docs › Orders: one page of order packets with every facet's counts. */
export async function listOrderPackets(organizationId: OrgId, query: OrderPacketParsedQuery): Promise<OrderPacketQueue> {
  const result = await tenantQuery<{ packets: RawPacket[]; unpaired: RawUnpairedLabel[] }>(organizationId, ORDER_PACKETS_SQL, orderPacketsParams(organizationId, query));
  const head = result.rows[0];
  const unpaired = (head?.unpaired ?? []).map(toUnpaired);
  return orderPacketQueue((head?.packets ?? []).map((raw) => buildOrderPacket(toPacketSource(raw), unpaired)), query);
}

/** The sidebar's counts — {@link listOrderPackets} without the page. */
export async function countOrderPackets(organizationId: OrgId, query: OrderPacketParsedQuery): Promise<Omit<OrderPacketQueue, 'rows'>> {
  const { total, counts, gapCounts, channelCounts } = await listOrderPackets(organizationId, query);
  return { total, counts, gapCounts, channelCounts };
}

/**
 * The Orders URL → its query: one `status`, `gap` / `channel` as a comma list
 * or repeated params (the sidebar's multi facets write comma lists).
 */
export function parseOrderPacketSearchParams(params: Pick<URLSearchParams, 'get' | 'getAll'>) {
  const list = (name: string) => {
    const values = params.getAll(name).flatMap((value) => value.split(',')).map((value) => value.trim()).filter(Boolean);
    return values.length ? [...new Set(values)] : undefined;
  };
  const one = (name: string) => params.get(name)?.trim() || undefined;
  return orderPacketQuerySchema.safeParse({
    status: one('status'),
    gap: list('gap'),
    channel: list('channel'),
    sort: one('sort'),
    q: one('q'),
    ...(list('ids') ? { ids: list('ids') } : {}),
    limit: one('limit'),
    offset: one('offset'),
  });
}
