import 'server-only';
import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { createLabelIngestion } from '@/lib/label-ingestions/ingestion-service';
import { labelRowSelectSql, listOrderPaperwork, toLabelRow, type LabelQueueRow } from '@/lib/label-prints/print-queue';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import {
  labelBatchFileName,
  labelBatchPageFileName,
  labelBatchUploadWindow,
  MAX_LABEL_BATCH_BYTES,
  MAX_LABEL_BATCH_PAGES,
  type LabelBatchDetail,
  type LabelBatchFilters,
  type LabelBatchList,
  type LabelBatchPage,
  type LabelBatchRow,
  type LabelBatchUploadResult,
} from './contracts';

/**
 * Uploads on the Labels & docs desk. A batch is one uploaded PDF: the server
 * splits it and ingests every page through the ordinary label ingestion
 * (`createLabelIngestion`), then stamps each page's ledger row with
 * `batch_id` / `page_number`. The original PDF is not stored. The same bytes
 * uploaded again are the same batch.
 */

export class LabelBatchError extends Error {
  constructor(readonly code: 'INVALID_PDF' | 'PAYLOAD_TOO_LARGE', message: string) {
    super(message);
    this.name = 'LabelBatchError';
  }
}

/** Pages ingested at once — each page is a parse + object put + a few statements. */
const PAGE_CONCURRENCY = 4;

/** A deterministic client event per (upload event, page) — a retried POST claims the same ledger rows. */
export function labelBatchPageClientEventId(clientEventId: string, pageNumber: number): string {
  const hex = createHash('sha256').update(`label-batch-page:${clientEventId.toLowerCase()}:${pageNumber}`).digest('hex');
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// ── Batch rows ─────────────────────────────────────────────────────────────

interface BatchSqlRow {
  id: string;
  file_name: string;
  sha256: string;
  page_count: number;
  byte_size: string;
  uploaded_at: Date;
  uploaded_by: string | null;
  printed_pages: number;
  print_count: number;
  last_printed_at: Date | null;
  paired_pages: number;
  confirm_pages: number;
  [key: string]: unknown;
}

/** The batch row's columns over `label_batches b` (`$1` = org) with its page stats; callers add WHERE / ORDER BY. */
const BATCH_ROW_SQL = `SELECT b.id, b.file_name, b.sha256, b.page_count, b.byte_size, b.uploaded_at,
         s.name AS uploaded_by,
         COALESCE(st.printed_pages, 0) AS printed_pages, COALESCE(st.print_count, 0) AS print_count,
         st.last_printed_at, COALESCE(st.paired_pages, 0) AS paired_pages, COALESCE(st.confirm_pages, 0) AS confirm_pages
    FROM label_batches b
    LEFT JOIN staff s ON s.organization_id = b.organization_id AND s.id = b.uploaded_by_staff_id
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE pe.n > 0)::int AS printed_pages,
             COALESCE(sum(pe.n), 0)::int AS print_count,
             max(pe.last_at) AS last_printed_at,
             count(*) FILTER (WHERE li.matched_order_id IS NOT NULL)::int AS paired_pages,
             count(*) FILTER (WHERE li.state = 'QUARANTINED' AND li.quarantine_reason_code = 'BUYER_AMBIGUOUS')::int AS confirm_pages
        FROM label_ingestions li
        CROSS JOIN LATERAL (
          SELECT count(*) AS n, max(e.printed_at) AS last_at
            FROM label_print_events e
           WHERE e.organization_id = li.organization_id AND e.label_ingestion_id = li.id
        ) pe
       WHERE li.organization_id = b.organization_id AND li.batch_id = b.id
    ) st ON true`;

function toBatchRow(row: BatchSqlRow): LabelBatchRow {
  return {
    id: Number(row.id),
    fileName: row.file_name,
    sha256: row.sha256,
    pageCount: row.page_count,
    byteSize: Number(row.byte_size),
    uploadedAt: row.uploaded_at.toISOString(),
    uploadedBy: row.uploaded_by,
    printedPages: row.printed_pages,
    printCount: row.print_count,
    lastPrintedAt: row.last_printed_at ? row.last_printed_at.toISOString() : null,
    pairedPages: row.paired_pages,
    confirmPages: row.confirm_pages,
  };
}

async function readBatchRow(organizationId: OrgId, batchId: number): Promise<LabelBatchRow | null> {
  const result = await tenantQuery<BatchSqlRow>(organizationId, `${BATCH_ROW_SQL} WHERE b.organization_id = $1 AND b.id = $2`, [organizationId, batchId]);
  return result.rows[0] ? toBatchRow(result.rows[0]) : null;
}

/**
 * Batches, newest upload first. `q` matches the file name, a page's tracking
 * number or its order ref; `from`/`to` bound the upload date (warehouse civil
 * days, inclusive). `total` counts every match past the limit.
 */
export async function listLabelBatches(organizationId: OrgId, filters: LabelBatchFilters & { limit: number }): Promise<LabelBatchList> {
  const { fromIso, toIso } = labelBatchUploadWindow(filters);
  const q = filters.q?.trim();
  // `%`, `_` and `\` in the query match themselves.
  const pattern = q ? `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const result = await tenantQuery<BatchSqlRow & { total: number }>(
    organizationId,
    `WITH hits AS (
       SELECT b.id
         FROM label_batches b
        WHERE b.organization_id = $1
          AND ($2::timestamptz IS NULL OR b.uploaded_at >= $2::timestamptz)
          AND ($3::timestamptz IS NULL OR b.uploaded_at < $3::timestamptz)
          AND ($4::text IS NULL
               OR b.file_name ILIKE $4
               OR EXISTS (
                    SELECT 1
                      FROM label_ingestions li
                      LEFT JOIN orders o ON o.organization_id = li.organization_id AND o.id = li.matched_order_id
                     WHERE li.organization_id = $1 AND li.batch_id = b.id
                       AND (li.tracking_number_normalized ILIKE $4 OR li.tracking_number_raw ILIKE $4
                            OR li.matched_marketplace_order_id ILIKE $4 OR o.order_id ILIKE $4)
                  ))
     )
     SELECT (SELECT count(*) FROM hits)::int AS total, r.*
       FROM (${BATCH_ROW_SQL}
              WHERE b.organization_id = $1 AND b.id IN (SELECT id FROM hits)
              ORDER BY b.uploaded_at DESC, b.id DESC
              LIMIT $5) r
      ORDER BY r.uploaded_at DESC, r.id DESC`,
    [organizationId, fromIso, toIso, pattern, filters.limit],
  );
  // limit ≥ 1, so no row means no match.
  return { rows: result.rows.map(toBatchRow), total: result.rows[0]?.total ?? 0 };
}

/** One batch: its stored pages in page order and its paired orders' paperwork. Null when not this org's. */
export async function getLabelBatch(organizationId: OrgId, batchId: number): Promise<LabelBatchDetail | null> {
  const batch = await readBatchRow(organizationId, batchId);
  if (!batch) return null;
  const [pageRows, paperwork] = await Promise.all([
    tenantQuery<LabelQueueRow & { page_number: number | null }>(
      organizationId,
      `${labelRowSelectSql(', li.page_number')}
        WHERE li.organization_id = $1 AND li.batch_id = $2 AND li.staged_object_key IS NOT NULL
        ORDER BY li.page_number ASC NULLS LAST, li.id ASC`,
      [organizationId, batchId],
    ),
    listOrderPaperwork(
      organizationId,
      `SELECT li.matched_order_id AS order_id, min(li.observed_at) AS observed_at, true AS paired
         FROM label_ingestions li
        WHERE li.organization_id = $1 AND li.batch_id = $2
          AND li.staged_object_key IS NOT NULL AND li.matched_order_id IS NOT NULL
        GROUP BY li.matched_order_id`,
      [batchId],
    ),
  ]);
  const pages: LabelBatchPage[] = pageRows.rows.map((row) => ({ ...toLabelRow(row), pageNumber: Number(row.page_number ?? 0) }));
  // Paperwork beside its labels: in the order each order's first page appears.
  const firstPage = new Map<number, number>();
  for (const page of pages) if (page.orderId != null && !firstPage.has(page.orderId)) firstPage.set(page.orderId, page.pageNumber);
  paperwork.sort((a, b) => (firstPage.get(a.orderId) ?? Infinity) - (firstPage.get(b.orderId) ?? Infinity) || a.orderId - b.orderId);
  return { batch, pages, paperwork };
}

// ── Upload ─────────────────────────────────────────────────────────────────

async function loadPdf(bytes: Buffer): Promise<PDFDocument> {
  if (bytes.subarray(0, 5).toString('ascii') !== '%PDF-') throw new LabelBatchError('INVALID_PDF', 'The uploaded file is not a PDF.');
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false });
  } catch {
    throw new LabelBatchError('INVALID_PDF', 'The PDF could not be read (damaged or encrypted).');
  }
}

/** Page `index` (0-based) as its own one-page PDF. Deterministic bytes: the same page always hashes the same. */
async function extractPage(source: PDFDocument, index: number): Promise<Buffer> {
  const page = await PDFDocument.create({ updateMetadata: false });
  const [copied] = await page.copyPages(source, [index]);
  page.addPage(copied!);
  return Buffer.from(await page.save());
}

/**
 * Upload one label PDF. Bytes already a batch → that batch, `replayed`, and
 * nothing ingested — unless an earlier upload of them stopped part-way, when
 * the missing pages are ingested now (every page ingestion is idempotent).
 * Each page goes through `createLabelIngestion`; a page whose bytes are
 * already on file counts `alreadyOnFile` and joins this batch when it belongs
 * to none. A page that cannot be ingested is reported in `failed`; the others
 * still land.
 */
export async function uploadLabelBatch(input: {
  organizationId: OrgId;
  actorStaffId: number;
  clientEventId: string;
  fileName: string;
  bytes: Buffer;
}): Promise<LabelBatchUploadResult> {
  const { organizationId, bytes } = input;
  if (!bytes.length || bytes.length > MAX_LABEL_BATCH_BYTES) throw new LabelBatchError('PAYLOAD_TOO_LARGE', 'PDF exceeds the permitted size.');
  const source = await loadPdf(bytes);
  const pageCount = source.getPageCount();
  if (pageCount < 1) throw new LabelBatchError('INVALID_PDF', 'The PDF has no pages.');
  if (pageCount > MAX_LABEL_BATCH_PAGES) throw new LabelBatchError('PAYLOAD_TOO_LARGE', `A PDF may carry at most ${MAX_LABEL_BATCH_PAGES} labels.`);
  const fileName = labelBatchFileName(input.fileName);
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  const claimed = await withTenantTransaction(organizationId, async (client) => {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO label_batches (organization_id, file_name, sha256, page_count, byte_size, uploaded_by_staff_id)
       VALUES ($1, $2, $3, $4, $5, (SELECT id FROM staff WHERE organization_id = $1 AND id = $6))
       ON CONFLICT (organization_id, sha256) DO NOTHING
       RETURNING id`,
      [organizationId, fileName, sha256, pageCount, bytes.length, input.actorStaffId],
    );
    if (inserted.rows[0]) return { batchId: Number(inserted.rows[0].id), replayed: false, linkedPages: 0 };
    const existing = await client.query<{ id: string; linked: number }>(
      `SELECT b.id, (SELECT count(*)::int FROM label_ingestions li WHERE li.organization_id = b.organization_id AND li.batch_id = b.id) AS linked
         FROM label_batches b
        WHERE b.organization_id = $1 AND b.sha256 = $2`,
      [organizationId, sha256],
    );
    const row = existing.rows[0]!;
    return { batchId: Number(row.id), replayed: true, linkedPages: row.linked };
  });

  const pages: LabelBatchUploadResult['pages'] = { added: 0, alreadyOnFile: 0, failed: [] };
  if (claimed.replayed && claimed.linkedPages >= pageCount) {
    pages.alreadyOnFile = pageCount;
  } else {
    const observedAt = new Date().toISOString();
    let next = 0;
    const ingestPage = async (pageNumber: number) => {
      let pageSha: string | null = null;
      try {
        const pageBytes = pageCount === 1 ? bytes : await extractPage(source, pageNumber - 1);
        pageSha = createHash('sha256').update(pageBytes).digest('hex');
        const result = await createLabelIngestion({
          organizationId,
          actorStaffId: input.actorStaffId,
          clientEventId: labelBatchPageClientEventId(input.clientEventId, pageNumber),
          observedAt,
          fileBasename: labelBatchPageFileName(fileName, pageNumber, pageCount),
          bytes: pageBytes,
        });
        if (result.replayed) pages.alreadyOnFile += 1;
        else pages.added += 1;
      } catch (error) {
        pages.failed.push({ pageNumber, reason: error instanceof Error ? error.message : 'The page could not be ingested.' });
      }
      // By bytes, not id: a page that failed after its ledger row landed still joins, so a retry finds it.
      if (pageSha) {
        await tenantQuery(
          organizationId,
          `UPDATE label_ingestions SET batch_id = $3, page_number = $4
            WHERE organization_id = $1 AND sha256 = $2 AND batch_id IS NULL`,
          [organizationId, pageSha, claimed.batchId, pageNumber],
        );
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(PAGE_CONCURRENCY, pageCount) }, async () => {
        while (next < pageCount) {
          next += 1;
          await ingestPage(next);
        }
      }),
    );
    pages.failed.sort((a, b) => a.pageNumber - b.pageNumber);
  }

  const batch = await readBatchRow(organizationId, claimed.batchId);
  return { batch: batch!, replayed: claimed.replayed, pages };
}
