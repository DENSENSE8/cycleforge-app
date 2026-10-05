import 'server-only';
import { documentContentUrl } from '@/lib/documents/display-url';
import type { LabelIngestionState } from '@/lib/label-ingestions/types';
import { manualContentUrl } from '@/lib/manuals/order-manuals';
import type { OrgId } from '@/lib/tenancy/constants';
import { resolveSkuIdentityTitle, skuCatalogJoinOnSql } from '@/lib/sku/sku-identity-law';
import { tenantQuery } from '@/lib/tenancy/db';
import type {
  LabelOrderLine,
  LabelPrintChannel,
  LabelPrintEvent,
  LabelPrintQueue,
  LabelPrintRecordBody,
  LabelPrintRecordResult,
  LabelPrintRow,
  LabelPrintView,
  PaperworkDocKind,
  PaperworkDocumentRow,
  PaperworkPrintRecordBody,
  PaperworkPrintRecordResult,
  PaperworkPrintRow,
} from './contracts';

/**
 * The Labels & documents desk's reads and its two writes. Every label with a
 * stored PDF is printable — paired to an order or not; an unprinted label has
 * no `label_print_events` row, and a print never touches the ingestion. An
 * order paired to a stored label owns paperwork: its packing slips and the
 * manuals resolved for it; each prints (and logs to `paperwork_print_events`)
 * per order.
 */

export type RawOrderLine = {
  order_line_id: number;
  item_number: string | null;
  sku_catalog_id: number | null;
  catalog_title: string | null;
  product_title: string | null;
  sku: string | null;
  quantity: number;
};

/** The product lines of the order number `orderNumberSql` names — every `orders` row sharing it, one per line. `$1` = org. */
export function orderLinesSql(orderNumberSql: string): string {
  return `SELECT json_agg(json_build_object(
                  'order_line_id', rl.id,
                  'item_number', rl.item_number,
                  'sku_catalog_id', COALESCE(rl.sku_catalog_id, sc.id),
                  'catalog_title', sc.product_title,
                  'product_title', rl.product_title,
                  'sku', rl.sku,
                  'quantity', CASE WHEN rl.quantity ~ '^[0-9]+$' THEN rl.quantity::int ELSE 1 END
                ) ORDER BY rl.id) AS order_lines
           FROM orders rl
           LEFT JOIN sku_catalog sc ON ${skuCatalogJoinOnSql('rl')}
          WHERE rl.organization_id = $1
            AND NULLIF(${orderNumberSql}, '') IS NOT NULL
            AND rl.order_id = ${orderNumberSql}`;
}

/** Titles through the SKU identity law: the catalog's own title, then the order line's, then the SKU. */
export function toOrderLines(lines: RawOrderLine[] | null): LabelOrderLine[] {
  return (lines ?? []).map((line) => ({
    orderLineId: Number(line.order_line_id),
    itemNumber: line.item_number?.trim() || null,
    skuCatalogId: line.sku_catalog_id == null ? null : Number(line.sku_catalog_id),
    sku: line.sku?.trim() || null,
    title: resolveSkuIdentityTitle({ catalog_product_title: line.catalog_title, item_name: line.product_title, sku: line.sku }) || 'Untitled item',
    quantity: line.quantity,
  }));
}

const iso = (value: Date | string | null): string | null => (value == null ? null : new Date(value).toISOString());

// ── Labels ─────────────────────────────────────────────────────────────────

export interface LabelQueueRow {
  id: string;
  state: LabelIngestionState;
  row_version: number;
  source: string;
  file_basename: string;
  carrier: string | null;
  tracking_number_normalized: string | null;
  quarantine_reason_code: string | null;
  observed_at: Date;
  matched_order_id: number | null;
  order_ref: string | null;
  shipstation_shipment_id: string | null;
  print_count: number;
  last_printed_at: Date | null;
  last_printed_by: string | null;
  last_station_name: string | null;
  order_account_source: string | null;
  order_lines: RawOrderLine[] | null;
  [key: string]: unknown;
}

export function toLabelRow(row: LabelQueueRow): LabelPrintRow {
  return {
    id: Number(row.id),
    state: row.state,
    rowVersion: Number(row.row_version),
    source: row.source,
    fileBasename: row.file_basename,
    carrier: row.carrier,
    trackingNumber: row.tracking_number_normalized,
    quarantineReasonCode: row.quarantine_reason_code,
    observedAt: row.observed_at.toISOString(),
    orderId: row.matched_order_id,
    orderRef: row.order_ref,
    shipstationShipmentId: row.shipstation_shipment_id == null ? null : Number(row.shipstation_shipment_id),
    printCount: row.print_count,
    lastPrintedAt: iso(row.last_printed_at),
    lastPrintedBy: row.last_printed_by,
    lastStationName: row.last_station_name,
    orderAccountSource: row.order_account_source,
    orderLines: toOrderLines(row.order_lines),
  };
}

/**
 * The desk's label row: SELECT list + joins over `label_ingestions li`, `$1` =
 * the org. Callers add WHERE / ORDER BY / LIMIT (and extra `li.` columns) and
 * map with {@link toLabelRow}.
 */
export function labelRowSelectSql(extraColumns = ''): string {
  return `SELECT li.id, li.state, li.row_version, li.source, li.file_basename, li.carrier,
            li.tracking_number_normalized, li.quarantine_reason_code, li.observed_at,
            li.matched_order_id, li.shipstation_shipment_id,
            COALESCE(NULLIF(o.order_id, ''), li.matched_marketplace_order_id) AS order_ref,
            p.print_count, p.last_printed_at, s.name AS last_printed_by, p.last_station_name,
            o.account_source AS order_account_source, ol.order_lines${extraColumns}
       FROM label_ingestions li
       LEFT JOIN orders o
         ON o.organization_id = li.organization_id AND o.id = li.matched_order_id
       CROSS JOIN LATERAL (
         SELECT count(*)::int AS print_count,
                max(e.printed_at) AS last_printed_at,
                (array_agg(e.printed_by_staff_id ORDER BY e.printed_at DESC, e.id DESC))[1] AS last_staff_id,
                (array_agg(e.station_name ORDER BY e.printed_at DESC, e.id DESC))[1] AS last_station_name
           FROM label_print_events e
          WHERE e.organization_id = li.organization_id AND e.label_ingestion_id = li.id
       ) p
       LEFT JOIN staff s
         ON s.organization_id = li.organization_id AND s.id = p.last_staff_id
       LEFT JOIN LATERAL (${orderLinesSql('o.order_id')}) ol ON true`;
}

/** Unprinted: oldest arrival first (print in the order labels landed). Printed: newest print first. */
async function listLabelRows(organizationId: OrgId, printed: boolean, limit: number): Promise<LabelPrintRow[]> {
  const result = await tenantQuery<LabelQueueRow>(
    organizationId,
    `${labelRowSelectSql()}
      WHERE li.organization_id = $1
        AND li.staged_object_key IS NOT NULL
        AND (p.print_count > 0) = $2::boolean
      ORDER BY CASE WHEN NOT $2::boolean THEN li.observed_at END ASC,
               CASE WHEN $2::boolean THEN p.last_printed_at END DESC,
               li.id ASC
      LIMIT $3`,
    [organizationId, printed, limit],
  );
  return result.rows.map(toLabelRow);
}

async function countLabels(organizationId: OrgId): Promise<{ unprinted: number; printed: number }> {
  const result = await tenantQuery<{ unprinted: number; printed: number }>(
    organizationId,
    `SELECT count(*) FILTER (WHERE NOT printed)::int AS unprinted,
            count(*) FILTER (WHERE printed)::int AS printed
       FROM (
         SELECT EXISTS (
                  SELECT 1 FROM label_print_events e
                   WHERE e.organization_id = li.organization_id AND e.label_ingestion_id = li.id
                ) AS printed
           FROM label_ingestions li
          WHERE li.organization_id = $1 AND li.staged_object_key IS NOT NULL
       ) t`,
    [organizationId],
  );
  return { unprinted: result.rows[0]?.unprinted ?? 0, printed: result.rows[0]?.printed ?? 0 };
}

// ── Paperwork ──────────────────────────────────────────────────────────────

/** SQL twin of normalizeIdentifier: UPPER alnum, leading zeros stripped. */
const idKeySql = (expr: string) => `regexp_replace(regexp_replace(UPPER(TRIM(COALESCE(${expr}, ''))), '[^A-Z0-9]', '', 'g'), '^0+', '')`;
/** SQL twin of paperworkSkuKey: UPPER alnum (zeros kept). */
const skuKeySql = (expr: string) => `regexp_replace(UPPER(TRIM(COALESCE(${expr}, ''))), '[^A-Z0-9]', '', 'g')`;

/**
 * Every paperwork document of the candidate orders, in ONE statement. `candSql`
 * yields `(order_id, observed_at, paired)`; `$1` is the org. CTEs out:
 *   heads — the candidate orders; docs — their packing slips and manuals with
 *   `printable`, sort keys and this order's print stats.
 *
 * An order is every `orders` row sharing its order number (a multi-line order
 * has one row per line). Packing slips are `documents` of type packing_slip
 * linked to any line. Manuals resolve per line exactly like
 * `src/lib/manuals/order-manuals.ts` — pinned to the line (order), its item
 * number, or its SKU (catalog id, else SKU text); the catalog id falls back to
 * the SKU's catalog row, then the item number's platform crosswalk
 * (`resolveSkuCatalogId`). A manual keeps its most specific source across lines.
 */
function paperworkDocsSql(candSql: string): string {
  return `WITH cand AS (${candSql}),
  heads AS (
    SELECT c.order_id, c.observed_at, c.paired, o.order_id AS order_number, o.account_source,
           COALESCE(NULLIF(o.order_id, ''), o.id::text) AS order_ref
      FROM cand c
      JOIN orders o ON o.organization_id = $1 AND o.id = c.order_id
  ),
  lines AS (
    SELECT h.order_id AS head_id, rl.id AS line_id, rl.sku, rl.sku_catalog_id,
           ${idKeySql('rl.item_number')} AS item_key,
           ${skuKeySql('rl.sku')} AS sku_key
      FROM heads h
      JOIN orders rl
        ON rl.organization_id = $1
       AND (rl.id = h.order_id OR (NULLIF(h.order_number, '') IS NOT NULL AND rl.order_id = h.order_number))
  ),
  -- The item number's platform crosswalk, one pass over sku_platform_ids for every line that needs it.
  crosswalk AS (
    SELECT x.key, min(sp.sku_catalog_id) AS sku_catalog_id
      FROM sku_platform_ids sp
      CROSS JOIN LATERAL (VALUES (${skuKeySql('sp.platform_item_id')}), (${skuKeySql('sp.platform_sku')})) AS x(key)
     WHERE sp.organization_id = $1
       AND sp.sku_catalog_id IS NOT NULL
       AND x.key IN (SELECT item_key FROM lines WHERE item_key <> '' AND sku_catalog_id IS NULL)
     GROUP BY x.key
  ),
  keys AS (
    SELECT l.head_id, l.line_id, l.item_key, l.sku_key,
           COALESCE(
             l.sku_catalog_id,
             (SELECT sc.id FROM sku_catalog sc
               WHERE sc.organization_id = $1 AND NULLIF(TRIM(l.sku), '') IS NOT NULL AND sc.sku = TRIM(l.sku)
               LIMIT 1),
             cw.sku_catalog_id
           ) AS catalog_id
      FROM lines l
      LEFT JOIN crosswalk cw ON l.item_key <> '' AND cw.key = l.item_key
  ),
  slips AS (
    SELECT k.head_id, d.id AS document_id, d.created_at,
           array_agg(DISTINCT k.line_id ORDER BY k.line_id) AS order_line_ids,
           CASE WHEN NULLIF(TRIM(d.document_data->>'filename'), '') IS NULL THEN 'Packing slip'
                ELSE 'Packing slip · ' || TRIM(d.document_data->>'filename') END AS title
      FROM keys k
      JOIN document_entity_links dl
        ON dl.organization_id = $1 AND dl.entity_type = 'ORDER' AND dl.entity_id = k.line_id
      JOIN documents d
        ON d.organization_id = $1 AND d.id = dl.document_id AND d.document_type = 'packing_slip'
     GROUP BY k.head_id, d.id
  ),
  manuals AS (
    SELECT k.head_id, pm.id AS manual_id, pm.source_url, pm.updated_at,
           array_agg(DISTINCT k.line_id ORDER BY k.line_id) AS order_line_ids,
           pm.item_number, COALESCE(NULLIF(TRIM(pm.sku), ''), psc.sku) AS paired_sku, pm.sku_catalog_id,
           COALESCE(NULLIF(TRIM(pm.display_name), ''), NULLIF(TRIM(pm.file_name), ''), 'Manual ' || pm.id) AS title,
           MIN(CASE WHEN pm.order_id = k.line_id THEN 0
                    WHEN k.item_key <> '' AND ${idKeySql('pm.item_number')} = k.item_key THEN 1
                    ELSE 2 END) AS source_rank
      FROM keys k
      JOIN product_manuals pm
        ON pm.organization_id = $1
       AND pm.is_active = TRUE
       AND pm.status = 'assigned'
       AND (
         pm.order_id = k.line_id
         OR (k.item_key <> '' AND ${idKeySql('pm.item_number')} = k.item_key)
         OR (k.catalog_id IS NOT NULL AND pm.sku_catalog_id = k.catalog_id)
         OR (k.sku_key <> '' AND ${skuKeySql('pm.sku')} = k.sku_key)
       )
      LEFT JOIN sku_catalog psc
        ON psc.organization_id = pm.organization_id AND psc.id = pm.sku_catalog_id
     GROUP BY k.head_id, pm.id, psc.sku
  ),
  doc_list AS (
    SELECT head_id, 'packing_slip'::text AS kind, document_id, NULL::bigint AS manual_id, title,
           NULL::text AS source_url, created_at AS sort_at, 0 AS sort_group, 0 AS source_rank, true AS printable,
           'order'::text AS association_source, order_line_ids, NULL::text AS item_number,
           NULL::text AS paired_sku, NULL::int AS sku_catalog_id
      FROM slips
    UNION ALL
    SELECT head_id, 'manual'::text, NULL::int, manual_id, title,
           source_url, updated_at, 1, source_rank, TRIM(COALESCE(source_url, '')) LIKE 'http%',
           CASE source_rank WHEN 0 THEN 'order' WHEN 1 THEN 'item_number' ELSE 'sku' END,
           order_line_ids, item_number, paired_sku, sku_catalog_id
      FROM manuals
  ),
  doc_prints AS (
    SELECT e.order_id, e.document_kind, e.document_id, e.manual_id,
           count(*)::int AS print_count, max(e.printed_at) AS last_printed_at
      FROM paperwork_print_events e
     WHERE e.organization_id = $1 AND e.order_id IN (SELECT order_id FROM heads)
     GROUP BY 1, 2, 3, 4
  ),
  docs AS (
    SELECT dl.*, COALESCE(dp.print_count, 0) AS print_count, dp.last_printed_at
      FROM doc_list dl
      LEFT JOIN doc_prints dp
        ON dp.order_id = dl.head_id AND dp.document_kind = dl.kind
       AND dp.document_id IS NOT DISTINCT FROM dl.document_id
       AND dp.manual_id IS NOT DISTINCT FROM dl.manual_id
  )`;
}

interface RawPaperworkDoc {
  kind: PaperworkDocKind;
  document_id: number | null;
  manual_id: number | null;
  title: string;
  source_url: string | null;
  sort_at: string | null;
  print_count: number;
  last_printed_at: string | null;
  association_source: 'order' | 'item_number' | 'sku';
  order_line_ids: number[] | null;
  item_number: string | null;
  paired_sku: string | null;
  sku_catalog_id: number | null;
}

interface PaperworkQueueRow {
  paperwork_count: number;
  printed_count: number;
  order_id: number | null;
  observed_at: Date | null;
  order_ref: string | null;
  account_source: string | null;
  print_count: number | null;
  last_printed_at: Date | null;
  last_printed_by: string | null;
  last_station_name: string | null;
  order_lines: RawOrderLine[] | null;
  documents: RawPaperworkDoc[] | null;
  [key: string]: unknown;
}

function toPaperworkDocument(doc: RawPaperworkDoc): PaperworkDocumentRow {
  const association = {
    source: doc.association_source,
    orderLineIds: (doc.order_line_ids ?? []).map(Number),
    itemNumber: doc.item_number?.trim() || null,
    sku: doc.paired_sku?.trim() || null,
    skuCatalogId: doc.sku_catalog_id == null ? null : Number(doc.sku_catalog_id),
  };
  if (doc.kind === 'packing_slip') {
    const id = Number(doc.document_id);
    return { key: `doc:${id}`, kind: 'packing_slip', documentId: id, manualId: null, title: doc.title, src: documentContentUrl(id), printCount: doc.print_count, lastPrintedAt: iso(doc.last_printed_at), association };
  }
  const id = Number(doc.manual_id);
  const content = manualContentUrl(id, doc.source_url);
  // Versioned like the order manuals list: the content route is browser-cached, and Replace keeps the id.
  const version = doc.sort_at ? Date.parse(doc.sort_at) : 0;
  return {
    key: `manual:${id}`,
    kind: 'manual',
    documentId: null,
    manualId: id,
    title: doc.title,
    src: content ? `${content}?v=${version}` : null,
    printCount: doc.print_count,
    lastPrintedAt: iso(doc.last_printed_at),
    association,
  };
}

/** After {@link paperworkDocsSql}: each head's paperwork-print stats (`per_order`). */
const PER_ORDER_CTES = `order_prints AS (
    SELECT e.order_id, count(*)::int AS print_count, max(e.printed_at) AS last_printed_at,
           (array_agg(e.printed_by_staff_id ORDER BY e.printed_at DESC, e.id DESC))[1] AS last_staff_id,
           (array_agg(e.station_name ORDER BY e.printed_at DESC, e.id DESC))[1] AS last_station_name
      FROM paperwork_print_events e
     WHERE e.organization_id = $1 AND e.order_id IN (SELECT order_id FROM heads)
     GROUP BY e.order_id
  ),
  per_order AS (
    SELECT h.*, COALESCE(h.observed_at, op.last_printed_at) AS sort_observed_at,
           EXISTS (SELECT 1 FROM docs d WHERE d.head_id = h.order_id AND d.printable AND d.print_count = 0) AS has_unprinted,
           COALESCE(op.print_count, 0) AS print_count, op.last_printed_at, op.last_staff_id, op.last_station_name
      FROM heads h
      LEFT JOIN order_prints op ON op.order_id = h.order_id
  )`;

/** One paperwork card's columns off `per_order po`… */
const PAPERWORK_CARD_COLUMNS = `po.order_id, po.sort_observed_at AS observed_at, po.order_ref, po.account_source,
           po.print_count, po.last_printed_at, s.name AS last_printed_by, po.last_station_name,
           ol.order_lines, dj.documents`;

/** …and the joins they read. */
const PAPERWORK_CARD_JOINS = `LEFT JOIN staff s ON s.organization_id = $1 AND s.id = po.last_staff_id
      LEFT JOIN LATERAL (${orderLinesSql('po.order_number')}) ol ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object(
                 'kind', d.kind, 'document_id', d.document_id, 'manual_id', d.manual_id, 'title', d.title,
                 'source_url', d.source_url, 'sort_at', d.sort_at, 'print_count', d.print_count,
                 'last_printed_at', d.last_printed_at, 'association_source', d.association_source,
                 'order_line_ids', d.order_line_ids, 'item_number', d.item_number,
                 'paired_sku', d.paired_sku, 'sku_catalog_id', d.sku_catalog_id
               ) ORDER BY d.sort_group, d.source_rank, d.sort_at DESC NULLS LAST, COALESCE(d.document_id, d.manual_id) DESC) AS documents
          FROM docs d
         WHERE d.head_id = po.order_id
      ) dj ON true`;

function toPaperworkRow(row: PaperworkQueueRow & { order_id: number }): PaperworkPrintRow {
  return {
    orderId: Number(row.order_id),
    orderRef: row.order_ref ?? String(row.order_id),
    orderAccountSource: row.account_source,
    orderLines: toOrderLines(row.order_lines),
    documents: (row.documents ?? []).map(toPaperworkDocument),
    printCount: row.print_count ?? 0,
    lastPrintedAt: iso(row.last_printed_at),
    lastPrintedBy: row.last_printed_by,
    lastStationName: row.last_station_name,
    observedAt: iso(row.observed_at) ?? new Date(0).toISOString(),
  };
}

/**
 * Paperwork orders plus both paperwork counts. `printed` false: paired orders
 * with a printable document never printed for them, oldest label arrival first.
 * `printed` true: orders with any paperwork print, newest print first.
 * `limit` 0 reads the counts only.
 */
async function listPaperworkRows(
  organizationId: OrgId,
  printed: boolean,
  limit: number,
): Promise<{ rows: PaperworkPrintRow[]; unprinted: number; printed: number }> {
  const cand = `SELECT order_id, min(observed_at) AS observed_at, bool_or(paired) AS paired
                  FROM (
                    SELECT li.matched_order_id AS order_id, li.observed_at, true AS paired
                      FROM label_ingestions li
                     WHERE li.organization_id = $1 AND li.staged_object_key IS NOT NULL AND li.matched_order_id IS NOT NULL
                    UNION ALL
                    SELECT DISTINCT e.order_id, NULL::timestamptz, false
                      FROM paperwork_print_events e
                     WHERE e.organization_id = $1
                  ) c
                 GROUP BY order_id`;
  const result = await tenantQuery<PaperworkQueueRow>(
    organizationId,
    `${paperworkDocsSql(cand)},
  ${PER_ORDER_CTES}
SELECT cnt.paperwork_count, cnt.printed_count, r.*
  FROM (
    SELECT count(*) FILTER (WHERE paired AND has_unprinted)::int AS paperwork_count,
           count(*) FILTER (WHERE print_count > 0)::int AS printed_count
      FROM per_order
  ) cnt
  LEFT JOIN LATERAL (
    SELECT ${PAPERWORK_CARD_COLUMNS},
           row_number() OVER (
             ORDER BY CASE WHEN $2::boolean THEN po.last_printed_at END DESC,
                      CASE WHEN NOT $2::boolean THEN po.sort_observed_at END ASC,
                      po.order_id ASC
           ) AS ord
      FROM per_order po
      ${PAPERWORK_CARD_JOINS}
     WHERE CASE WHEN $2::boolean THEN po.print_count > 0 ELSE po.paired AND po.has_unprinted END
     ORDER BY ord
     LIMIT $3
  ) r ON true
 ORDER BY r.ord`,
    [organizationId, printed, limit],
  );
  const head = result.rows[0];
  return {
    rows: result.rows.flatMap((row) => (row.order_id == null ? [] : [toPaperworkRow({ ...row, order_id: row.order_id })])),
    unprinted: head?.paperwork_count ?? 0,
    printed: head?.printed_count ?? 0,
  };
}

/**
 * Every paperwork card of the orders `candSql` yields — the Paperwork view's
 * own resolution (slips + manuals per order, printed or not), oldest arrival
 * first. `candSql` yields `(order_id, observed_at, paired)`; `$1` is the org,
 * `values` bind `$2…`.
 */
export async function listOrderPaperwork(organizationId: OrgId, candSql: string, values: unknown[] = []): Promise<PaperworkPrintRow[]> {
  const result = await tenantQuery<PaperworkQueueRow & { order_id: number }>(
    organizationId,
    `${paperworkDocsSql(candSql)},
  ${PER_ORDER_CTES}
SELECT ${PAPERWORK_CARD_COLUMNS}
  FROM per_order po
  ${PAPERWORK_CARD_JOINS}
 ORDER BY po.sort_observed_at ASC NULLS LAST, po.order_id ASC`,
    [organizationId, ...values],
  );
  return result.rows.map(toPaperworkRow);
}

// ── The queue ──────────────────────────────────────────────────────────────

/** One view of the print desk, with true counts for all three views. */
export async function listPrintDeskQueue(organizationId: OrgId, view: LabelPrintView, limit: number): Promise<LabelPrintQueue> {
  const [labels, labelCounts, paperwork] = await Promise.all([
    view === 'paperwork' ? Promise.resolve([]) : listLabelRows(organizationId, view === 'printed', limit),
    countLabels(organizationId),
    listPaperworkRows(organizationId, view === 'printed', view === 'labels' ? 0 : limit),
  ]);
  const counts = {
    labels: labelCounts.unprinted,
    paperwork: paperwork.unprinted,
    printed: labelCounts.printed + paperwork.printed,
  };
  if (view === 'labels') return { view, rows: labels, counts };
  if (view === 'paperwork') return { view, rows: paperwork.rows, counts };
  return { view, labels, paperwork: paperwork.rows, counts };
}

// ── The print logs ─────────────────────────────────────────────────────────

/**
 * Log one label print batch. The reprint flag is read from the log itself,
 * not the client; ids that are not this org's printable labels log nothing; a
 * replayed batch id logs nothing twice.
 */
export async function recordLabelPrints(
  organizationId: OrgId,
  staffId: number,
  body: LabelPrintRecordBody,
): Promise<LabelPrintRecordResult> {
  const result = await tenantQuery<{ label_ingestion_id: string }>(
    organizationId,
    `INSERT INTO label_print_events
            (organization_id, label_ingestion_id, batch_id, channel, printer_name, station_id, station_name,
             is_reprint, printed_by_staff_id)
     SELECT li.organization_id, li.id, $2::uuid, $3, $4, $7, $8,
            EXISTS (SELECT 1 FROM label_print_events e
                     WHERE e.organization_id = li.organization_id AND e.label_ingestion_id = li.id),
            $5
       FROM label_ingestions li
      WHERE li.organization_id = $1
        AND li.id = ANY($6::bigint[])
        AND li.staged_object_key IS NOT NULL
     ON CONFLICT (organization_id, batch_id, label_ingestion_id) DO NOTHING
     RETURNING label_ingestion_id`,
    [
      organizationId,
      body.batchId,
      body.channel,
      body.printerName ?? null,
      staffId,
      body.ingestionIds,
      body.stationId ?? null,
      body.stationName ?? null,
    ],
  );
  return { batchId: body.batchId, recorded: result.rows.map((row) => Number(row.label_ingestion_id)) };
}

/**
 * Log one paperwork print batch. Each item logs only when its packing slip or
 * printable manual resolves for that order in this org (same resolution as the
 * Paperwork view); the reprint flag is read from the log; a replayed batch id
 * logs nothing twice.
 */
export async function recordPaperworkPrints(
  organizationId: OrgId,
  staffId: number,
  body: PaperworkPrintRecordBody,
): Promise<PaperworkPrintRecordResult> {
  const cand = `SELECT o.id AS order_id, NULL::timestamptz AS observed_at, true AS paired
                  FROM orders o
                 WHERE o.organization_id = $1 AND o.id = ANY($2::int[])`;
  const result = await tenantQuery(
    organizationId,
    `${paperworkDocsSql(cand)},
  req AS (
    SELECT * FROM unnest($2::int[], $3::text[], $4::int[], $5::bigint[]) AS r(order_id, kind, document_id, manual_id)
  )
INSERT INTO paperwork_print_events
       (organization_id, order_id, document_kind, document_id, manual_id, batch_id, channel, printer_name,
        station_id, station_name, is_reprint, printed_by_staff_id)
SELECT $1, r.order_id, r.kind, r.document_id, r.manual_id, $6::uuid, $7, $8, $9, $10, d.print_count > 0, $11
  FROM req r
  JOIN docs d
    ON d.head_id = r.order_id AND d.kind = r.kind AND d.printable
   AND d.document_id IS NOT DISTINCT FROM r.document_id
   AND d.manual_id IS NOT DISTINCT FROM r.manual_id
ON CONFLICT ON CONSTRAINT paperwork_print_events_batch_doc_uniq DO NOTHING
RETURNING id`,
    [
      organizationId,
      body.items.map((item) => item.orderId),
      body.items.map((item) => item.kind),
      body.items.map((item) => (item.kind === 'packing_slip' ? item.documentId ?? null : null)),
      body.items.map((item) => (item.kind === 'manual' ? item.manualId ?? null : null)),
      body.batchId,
      body.channel,
      body.printerName ?? null,
      body.stationId ?? null,
      body.stationName ?? null,
      staffId,
    ],
  );
  return { batchId: body.batchId, recorded: result.rowCount ?? 0 };
}

/** One label's print log, newest first. Null when the label is not this org's. */
export async function listLabelPrintHistory(organizationId: OrgId, ingestionId: number): Promise<LabelPrintEvent[] | null> {
  const [label, events] = await Promise.all([
    tenantQuery(organizationId, `SELECT 1 FROM label_ingestions WHERE organization_id = $1 AND id = $2`, [organizationId, ingestionId]),
    tenantQuery<{
      id: string;
      batch_id: string;
      channel: LabelPrintChannel;
      printer_name: string | null;
      station_name: string | null;
      is_reprint: boolean;
      printed_at: Date;
      printed_by: string | null;
    }>(
      organizationId,
      `SELECT e.id, e.batch_id, e.channel, e.printer_name, e.station_name, e.is_reprint, e.printed_at, s.name AS printed_by
         FROM label_print_events e
         LEFT JOIN staff s ON s.organization_id = e.organization_id AND s.id = e.printed_by_staff_id
        WHERE e.organization_id = $1 AND e.label_ingestion_id = $2
        ORDER BY e.printed_at DESC, e.id DESC
        LIMIT 100`,
      [organizationId, ingestionId],
    ),
  ]);
  if (label.rowCount === 0) return null;
  return events.rows.map((row) => ({
    id: Number(row.id),
    batchId: row.batch_id,
    channel: row.channel,
    printerName: row.printer_name,
    stationName: row.station_name,
    isReprint: row.is_reprint,
    printedAt: row.printed_at.toISOString(),
    printedBy: row.printed_by,
  }));
}
