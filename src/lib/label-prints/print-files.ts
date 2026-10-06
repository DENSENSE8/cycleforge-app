import 'server-only';
import { documentContentUrl } from '@/lib/documents/display-url';
import { warehouseDayWindow } from '@/lib/label-batches/contracts';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { labelPdfSrc } from './http-client';
import {
  printFileQuerySchema,
  type PageStock,
  type PrintFileDetail,
  type PrintFilePage,
  type PrintFileParsedQuery,
  type PrintFileQueue,
  type PrintFileRow,
  type PrintFileSort,
  type PrintFileStatus,
} from './print-file-contracts';
import { LABEL_EVENT_OF_INGESTION_SQL } from './print-queue';

/**
 * Labels & docs › Bulk — the FILE list: one row per uploaded PDF
 * (`label_batches`). A file's pages are its label ingestions
 * (`label_ingestions.batch_id`) and its paperwork pages (`documents`
 * `upload_batch_id`); a page is printed once it has a print event — a label
 * page in `label_print_events` (by ingestion, or by its applied document), a
 * paperwork page in `paperwork_print_events` (packing_slip by document id).
 * Last printed / by / station come from the newest event across both tables.
 *
 * Every filter runs in SQL: Find over file name, any page's tracking and any
 * matched page's order number; Uploaded window on `uploaded_at`; Printed
 * window = any event of any page inside it (warehouse civil days). Print
 * status is `printedPages` against `page_count` (the same rule as
 * `printFileStatus`); its counts are taken under every OTHER filter.
 */

/** Pages at least this certain are `matched`; a buyer-name pairing (or an ambiguous buyer) is `review`. */
const SURE_MATCH_METHODS_SQL = `('CYCLEFORGE_REFERENCE', 'MARKETPLACE_ORDER_ID', 'TRACKING_NUMBER', 'OPERATOR_CONFIRMED')`;

/** Per-page print stats over events `e`, with prints inside the `[from, to)` window counted apart. */
function pagePrintsSql(table: string, predicate: string, window: { from: string; to: string }): string {
  return `CROSS JOIN LATERAL (
      SELECT count(*)::int AS print_count,
             max(e.printed_at) AS last_printed_at,
             (array_agg(e.printed_by_staff_id ORDER BY e.printed_at DESC, e.id DESC))[1] AS last_staff_id,
             (array_agg(e.station_name ORDER BY e.printed_at DESC, e.id DESC))[1] AS last_station_name,
             count(*) FILTER (WHERE (${window.from}::timestamptz IS NULL OR e.printed_at >= ${window.from}::timestamptz)
                                AND (${window.to}::timestamptz IS NULL OR e.printed_at < ${window.to}::timestamptz))::int AS window_prints
        FROM ${table} e
       WHERE ${predicate}
    ) p`;
}

/**
 * Every page of the files `fileId` names (a placeholder, or `NULL` for all) —
 * `print_page` CTE body. `$1` = org.
 */
function printPagesSql(fileId: string, window: { from: string; to: string }): string {
  return `SELECT li.batch_id AS file_id, li.page_number, 'label'::text AS stock, li.id AS ingestion_id, li.document_id,
           li.matched_order_id AS order_id,
           COALESCE(NULLIF(o.order_id, ''), li.matched_marketplace_order_id) AS order_ref,
           CASE
             WHEN li.state = 'APPLIED' OR (li.matched_order_id IS NOT NULL AND li.match_method IN ${SURE_MATCH_METHODS_SQL}) THEN 'matched'
             WHEN li.matched_order_id IS NOT NULL OR li.quarantine_reason_code = 'BUYER_AMBIGUOUS' THEN 'review'
             ELSE 'unmatched'
           END AS match,
           COALESCE(li.tracking_number_normalized, li.tracking_number_raw) AS tracking,
           p.print_count, p.last_printed_at, p.last_staff_id, p.last_station_name, p.window_prints
      FROM label_ingestions li
      LEFT JOIN orders o ON o.organization_id = li.organization_id AND o.id = li.matched_order_id
      ${pagePrintsSql('label_print_events', LABEL_EVENT_OF_INGESTION_SQL, window)}
     WHERE li.organization_id = $1 AND li.batch_id IS NOT NULL AND li.staged_object_key IS NOT NULL
       AND (${fileId}::bigint IS NULL OR li.batch_id = ${fileId}::bigint)
    UNION ALL
    SELECT d.upload_batch_id, d.upload_page_number, 'paper'::text, NULL::bigint, d.id,
           dl.entity_id,
           NULLIF(o.order_id, ''),
           CASE WHEN dl.entity_id IS NOT NULL THEN 'matched' ELSE 'unmatched' END,
           NULL::text,
           p.print_count, p.last_printed_at, p.last_staff_id, p.last_station_name, p.window_prints
      FROM documents d
      LEFT JOIN LATERAL (
        SELECT l.entity_id
          FROM document_entity_links l
         WHERE l.organization_id = d.organization_id AND l.document_id = d.id AND l.entity_type = 'ORDER'
         ORDER BY (l.link_role = 'primary') DESC, l.id ASC
         LIMIT 1
      ) dl ON true
      LEFT JOIN orders o ON o.organization_id = d.organization_id AND o.id = dl.entity_id
      ${pagePrintsSql(
        'paperwork_print_events',
        `e.organization_id = d.organization_id AND e.document_kind = 'packing_slip' AND e.document_id = d.id`,
        window,
      )}
     WHERE d.organization_id = $1 AND d.upload_batch_id IS NOT NULL
       AND (${fileId}::bigint IS NULL OR d.upload_batch_id = ${fileId}::bigint)`;
}

const ORDER_BY: Readonly<Record<PrintFileSort, string>> = {
  newest: 'r.uploaded_at DESC, r.id DESC',
  oldest: 'r.uploaded_at ASC, r.id ASC',
  'last-printed': 'r.last_printed_at DESC NULLS LAST, r.uploaded_at DESC, r.id DESC',
};

/**
 * The file list in ONE statement. Params: `$1` org · `$2`/`$3` uploaded window ·
 * `$4`/`$5` printed window · `$6` Find (ILIKE pattern) · `$7` print status ·
 * `$8` limit · `$9` offset · `$10` one file id (or null). Always one row: the
 * totals, then the page's file columns (null when the page is empty).
 */
export function printFilesSql(sort: PrintFileSort): string {
  return `WITH print_page AS (
    ${printPagesSql('$10', { from: '$4', to: '$5' })}
  ),
  file_stats AS (
    SELECT pg.file_id,
           count(*) FILTER (WHERE pg.stock = 'label')::int AS label_pages,
           count(*) FILTER (WHERE pg.stock = 'paper')::int AS paper_pages,
           count(*) FILTER (WHERE pg.print_count > 0)::int AS printed_pages,
           max(pg.last_printed_at) AS last_printed_at,
           (array_agg(pg.last_staff_id ORDER BY pg.last_printed_at DESC NULLS LAST))[1] AS last_staff_id,
           (array_agg(pg.last_station_name ORDER BY pg.last_printed_at DESC NULLS LAST))[1] AS last_station_name,
           count(*) FILTER (WHERE pg.order_id IS NOT NULL)::int AS matched_pages,
           COALESCE(sum(pg.window_prints), 0)::int AS window_prints,
           COALESCE(bool_or(pg.tracking ILIKE $6 OR pg.order_ref ILIKE $6), false) AS find_hit
      FROM print_page pg
     GROUP BY pg.file_id
  ),
  print_file AS (
    SELECT b.id, b.file_name, b.page_count, b.byte_size, b.uploaded_at, us.name AS uploaded_by,
           COALESCE(st.label_pages, 0) AS label_pages, COALESCE(st.paper_pages, 0) AS paper_pages,
           COALESCE(st.printed_pages, 0) AS printed_pages, st.last_printed_at,
           ls.name AS last_printed_by, st.last_station_name, COALESCE(st.matched_pages, 0) AS matched_pages,
           CASE
             WHEN COALESCE(st.printed_pages, 0) <= 0 THEN 'not-printed'
             WHEN st.printed_pages >= b.page_count THEN 'printed'
             ELSE 'partly'
           END AS status
      FROM label_batches b
      LEFT JOIN file_stats st ON st.file_id = b.id
      LEFT JOIN staff us ON us.organization_id = b.organization_id AND us.id = b.uploaded_by_staff_id
      LEFT JOIN staff ls ON ls.organization_id = b.organization_id AND ls.id = st.last_staff_id
     WHERE b.organization_id = $1
       AND ($10::bigint IS NULL OR b.id = $10::bigint)
       AND ($2::timestamptz IS NULL OR b.uploaded_at >= $2::timestamptz)
       AND ($3::timestamptz IS NULL OR b.uploaded_at < $3::timestamptz)
       AND (($4::timestamptz IS NULL AND $5::timestamptz IS NULL) OR COALESCE(st.window_prints, 0) > 0)
       AND ($6::text IS NULL OR b.file_name ILIKE $6 OR COALESCE(st.find_hit, false))
  ),
  tally AS (
    SELECT count(*) FILTER (WHERE $7::text IS NULL OR f.status = $7::text)::int AS total,
           count(*)::int AS count_all,
           count(*) FILTER (WHERE f.status = 'not-printed')::int AS count_not_printed,
           count(*) FILTER (WHERE f.status = 'partly')::int AS count_partly,
           count(*) FILTER (WHERE f.status = 'printed')::int AS count_printed
      FROM print_file f
  )
  SELECT t.total, t.count_all, t.count_not_printed, t.count_partly, t.count_printed, r.*
    FROM tally t
    LEFT JOIN LATERAL (
      SELECT f.*
        FROM print_file f
       WHERE $7::text IS NULL OR f.status = $7::text
       ORDER BY ${ORDER_BY[sort].replace(/\br\./g, 'f.')}
       LIMIT $8 OFFSET $9
    ) r ON true
   ORDER BY ${ORDER_BY[sort]}`;
}

interface PrintFileSqlRow {
  total: number;
  count_all: number;
  count_not_printed: number;
  count_partly: number;
  count_printed: number;
  id: string | null;
  file_name: string;
  page_count: number;
  byte_size: string;
  uploaded_at: Date;
  uploaded_by: string | null;
  label_pages: number;
  paper_pages: number;
  printed_pages: number;
  last_printed_at: Date | null;
  last_printed_by: string | null;
  last_station_name: string | null;
  matched_pages: number;
  [key: string]: unknown;
}

/** `$1…$10` of {@link printFilesSql}. A blank Find is no filter; `%`, `_`, `\` in it match themselves. */
export function printFilesParams(organizationId: OrgId, query: PrintFileParsedQuery, fileId: number | null = null): unknown[] {
  const uploaded = warehouseDayWindow({ from: query.from, to: query.to });
  const printed = warehouseDayWindow({ from: query.printedFrom, to: query.printedTo });
  const q = query.q?.trim();
  return [
    organizationId,
    uploaded.fromIso,
    uploaded.toIso,
    printed.fromIso,
    printed.toIso,
    q ? `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null,
    query.printing ?? null,
    query.limit,
    query.offset,
    fileId,
  ];
}

function toPrintFileRow(row: PrintFileSqlRow): PrintFileRow {
  const id = Number(row.id);
  return {
    id,
    fileName: row.file_name,
    pageCount: row.page_count,
    labelPages: row.label_pages,
    paperPages: row.paper_pages,
    byteSize: Number(row.byte_size),
    uploadedAt: row.uploaded_at.toISOString(),
    uploadedBy: row.uploaded_by,
    printedPages: row.printed_pages,
    lastPrintedAt: row.last_printed_at ? row.last_printed_at.toISOString() : null,
    lastPrintedBy: row.last_printed_by,
    lastStationName: row.last_station_name,
    matchedPages: row.matched_pages,
    src: `/api/shipping/label-intake/files/${id}/content`,
  };
}

async function queryPrintFiles(organizationId: OrgId, query: PrintFileParsedQuery, fileId: number | null = null): Promise<PrintFileQueue> {
  const result = await tenantQuery<PrintFileSqlRow>(organizationId, printFilesSql(query.sort), printFilesParams(organizationId, query, fileId));
  const head = result.rows[0];
  return {
    rows: result.rows.filter((row) => row.id != null).map(toPrintFileRow),
    total: head?.total ?? 0,
    counts: {
      all: head?.count_all ?? 0,
      'not-printed': head?.count_not_printed ?? 0,
      partly: head?.count_partly ?? 0,
      printed: head?.count_printed ?? 0,
    } satisfies Record<'all' | PrintFileStatus, number>,
  };
}

/** The file list for the sidebar's question (`query` as parsed by {@link printFileQuerySchema}). */
export async function listPrintFiles(organizationId: OrgId, query: PrintFileParsedQuery): Promise<PrintFileQueue> {
  return queryPrintFiles(organizationId, query);
}

/** The print-status counts under every other filter — the sidebar facet. `printing` is ignored. */
export async function countPrintFiles(organizationId: OrgId, query: PrintFileParsedQuery): Promise<PrintFileQueue['counts']> {
  return (await queryPrintFiles(organizationId, { ...query, printing: undefined, limit: 0, offset: 0 })).counts;
}

/** One file's row, no filters. Null when not this org's. */
export async function readPrintFileRow(organizationId: OrgId, fileId: number): Promise<PrintFileRow | null> {
  const { rows } = await queryPrintFiles(organizationId, printFileQuerySchema.parse({ limit: 1 }), fileId);
  return rows[0] ?? null;
}

interface PrintPageSqlRow {
  page_number: number | null;
  stock: PageStock;
  ingestion_id: string | null;
  document_id: number | null;
  order_id: number | null;
  order_ref: string | null;
  match: PrintFilePage['match'];
  print_count: number;
  last_printed_at: Date | null;
  [key: string]: unknown;
}

/** One file with its pages in page order (`$1` org, `$2` file). Null when not this org's. */
export async function getPrintFile(organizationId: OrgId, fileId: number): Promise<PrintFileDetail | null> {
  const [file, pages] = await Promise.all([
    readPrintFileRow(organizationId, fileId),
    tenantQuery<PrintPageSqlRow>(
      organizationId,
      `SELECT pg.* FROM (${printPagesSql('$2', { from: 'NULL', to: 'NULL' })}) pg
        ORDER BY pg.page_number ASC NULLS LAST, pg.stock ASC, pg.ingestion_id ASC NULLS LAST, pg.document_id ASC`,
      [organizationId, fileId],
    ),
  ]);
  if (!file) return null;
  return {
    ...file,
    pages: pages.rows.map((row) => {
      const ingestionId = row.ingestion_id == null ? null : Number(row.ingestion_id);
      const documentId = row.document_id == null ? null : Number(row.document_id);
      return {
        pageNumber: Number(row.page_number ?? 0),
        stock: row.stock,
        ingestionId,
        documentId,
        src: ingestionId != null ? labelPdfSrc(ingestionId) : documentContentUrl(documentId!),
        orderId: row.order_id == null ? null : Number(row.order_id),
        orderRef: row.order_ref,
        match: row.match,
        printCount: row.print_count,
        lastPrintedAt: row.last_printed_at ? row.last_printed_at.toISOString() : null,
      };
    }),
  };
}
