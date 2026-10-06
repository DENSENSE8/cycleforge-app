import 'server-only';
import { createHash } from 'node:crypto';
import { attachOutboundDocument, deleteOutboundDocument, storeOutboundDocumentFromBytes } from '@/lib/documents/outbound-documents';
import { matchSlipFile, type SlipCandidate } from '@/lib/documents/slip-matcher';
import {
  applyStoredLabelIngestion,
  createLabelIngestion,
  deleteUnlinkedLabelIngestion,
  LabelIngestionServiceError,
} from '@/lib/label-ingestions/ingestion-service';
import { extractPdfText } from '@/lib/label-ingestions/pdf-parser';
import type { LabelMatchMethod } from '@/lib/label-ingestions/types';
import type { PageStock, PrintFileUploadResult } from '@/lib/label-prints/print-file-contracts';
import { readPrintFileRow } from '@/lib/label-prints/print-files';
import { labelRowSelectSql, toLabelRow, type LabelQueueRow } from '@/lib/label-prints/print-queue';
import { sqlOrderNotBuyerCancelled, sqlOrderOpenUnshipped } from '@/lib/orders/desk-view-sql';
import { defaultGcsBucket, gcsAdapter } from '@/lib/photos/storage/gcs-adapter';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import { labelBatchFileName, labelBatchPageFileName, type LabelBatchDetail } from './contracts';
import { extractPdfPage, readUploadPdf } from './pdf-pages';

/**
 * The ONE upload writer of the Labels & docs desk. A batch is one uploaded PDF
 * — a "file" on Bulk. The original bytes are kept (preview); every page is
 * classified by its size and lands where its stock prints:
 *
 *   label  (4×6-class) → the ordinary label ingestion (`createLabelIngestion`),
 *          stamped `batch_id` / `page_number`. The ingestion's matcher runs;
 *          an exact match (reference / marketplace id / tracking) is applied
 *          to its order at once, a buyer-name match waits for review on Orders.
 *   paper  (Letter-class) → a one-page `packing_slip` document (unlinked),
 *          stamped `upload_batch_id` / `upload_page_number`; its text is read
 *          and the slip matcher links it to the ONE open order it names.
 *
 * Matching never fails the upload; a page that cannot be stored is reported
 * in `failedPages` and the rest still land. The same bytes uploaded again are
 * the same file (`duplicate`): only pages missing from it are landed.
 */

/** Pages landed at once — each page is a parse + object put + a few statements. */
const PAGE_CONCURRENCY = 4;

/** Label matches certain enough to apply to the order without asking. */
const AUTO_APPLY_METHODS: Partial<Record<LabelMatchMethod, true>> = {
  CYCLEFORGE_REFERENCE: true,
  MARKETPLACE_ORDER_ID: true,
  TRACKING_NUMBER: true,
};

/** A deterministic client event per (upload event, page) — a retried POST claims the same ledger rows. */
export function labelBatchPageClientEventId(clientEventId: string, pageNumber: number): string {
  const hex = createHash('sha256').update(`label-batch-page:${clientEventId.toLowerCase()}:${pageNumber}`).digest('hex');
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const sha256Hex = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

/** Every open order by order number (lowest line id) — what a packing-slip page may name. */
async function loadSlipCandidates(organizationId: OrgId): Promise<SlipCandidate[]> {
  const result = await tenantQuery<{ order_id: number; order_ref: string }>(
    organizationId,
    `SELECT min(o.id)::int AS order_id, o.order_id AS order_ref
       FROM orders o
       LEFT JOIN shipping_tracking_numbers stn ON stn.organization_id = $1 AND stn.id = o.shipment_id
      WHERE o.organization_id = $1
        AND NULLIF(BTRIM(o.order_id), '') IS NOT NULL
        AND ${sqlOrderOpenUnshipped('o')}
        AND ${sqlOrderNotBuyerCancelled('o')}
      GROUP BY o.order_id`,
    [organizationId],
  );
  return result.rows.map((row) => ({ orderId: Number(row.order_id), refs: [row.order_ref] }));
}

/** Upload one PDF (see the module note). `stock: 'label'` = an order slot's upload: every page a label, nothing auto-applied. */
export async function uploadLabelBatch(input: {
  organizationId: OrgId;
  actorStaffId: number;
  clientEventId: string;
  fileName: string;
  bytes: Buffer;
  stock?: 'label';
}): Promise<PrintFileUploadResult> {
  const { organizationId, actorStaffId, bytes } = input;
  const { source, stocks: sized } = await readUploadPdf(bytes);
  const stocks: PageStock[] = input.stock === 'label' ? sized.map(() => 'label') : sized;
  const autoApply = input.stock !== 'label';
  const pageCount = stocks.length;
  const fileName = labelBatchFileName(input.fileName);
  const sha256 = sha256Hex(bytes);
  const bucket = defaultGcsBucket();
  const objectKey = `label-batches/${organizationId}/${sha256.slice(0, 2)}/${sha256}.pdf`;

  // The original first (deterministic key, idempotent): a file row never exists without its preview bytes.
  const prior = await tenantQuery<{ original_object_key: string | null }>(
    organizationId,
    `SELECT original_object_key FROM label_batches WHERE organization_id = $1 AND sha256 = $2`,
    [organizationId, sha256],
  );
  if (!prior.rows[0]?.original_object_key) {
    await gcsAdapter.putObject({ organizationId, bucket, objectKey, buffer: bytes, contentType: 'application/pdf' });
  }

  const claimed = await withTenantTransaction(organizationId, async (client) => {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO label_batches (organization_id, file_name, sha256, page_count, byte_size, uploaded_by_staff_id,
                                  original_storage_provider, original_bucket, original_object_key)
       VALUES ($1, $2, $3, $4, $5, (SELECT id FROM staff WHERE organization_id = $1 AND id = $6), 'gcs', $7, $8)
       ON CONFLICT (organization_id, sha256) DO NOTHING
       RETURNING id`,
      [organizationId, fileName, sha256, pageCount, bytes.length, actorStaffId, bucket, objectKey],
    );
    if (inserted.rows[0]) return { batchId: Number(inserted.rows[0].id), duplicate: false };
    // A file from before originals were kept gains its original now.
    const existing = await client.query<{ id: string }>(
      `UPDATE label_batches
          SET original_storage_provider = COALESCE(original_storage_provider, 'gcs'),
              original_bucket = COALESCE(original_bucket, $3),
              original_object_key = COALESCE(original_object_key, $4)
        WHERE organization_id = $1 AND sha256 = $2
        RETURNING id`,
      [organizationId, sha256, bucket, objectKey],
    );
    return { batchId: Number(existing.rows[0]!.id), duplicate: true };
  });
  const { batchId } = claimed;

  let pending = Array.from({ length: pageCount }, (_, index) => index + 1);
  if (claimed.duplicate) {
    const landed = await tenantQuery<{ page_number: number }>(
      organizationId,
      `SELECT li.page_number FROM label_ingestions li
        WHERE li.organization_id = $1 AND li.batch_id = $2 AND li.page_number IS NOT NULL
       UNION
       SELECT d.upload_page_number FROM documents d
        WHERE d.organization_id = $1 AND d.upload_batch_id = $2 AND d.upload_page_number IS NOT NULL`,
      [organizationId, batchId],
    );
    const done = new Set(landed.rows.map((row) => Number(row.page_number)));
    pending = pending.filter((pageNumber) => !done.has(pageNumber));
  }

  const failedPages: PrintFileUploadResult['failedPages'] = [];
  const observedAt = new Date().toISOString();
  let candidates: Promise<SlipCandidate[]> | null = null;

  const landLabelPage = async (pageNumber: number, pageBytes: Buffer, pageName: string) => {
    const pageSha = sha256Hex(pageBytes);
    try {
      const { ingestion } = await createLabelIngestion({
        organizationId,
        actorStaffId,
        clientEventId: labelBatchPageClientEventId(input.clientEventId, pageNumber),
        observedAt,
        fileBasename: pageName,
        bytes: pageBytes,
      });
      if (autoApply && ingestion.state === 'MATCHED' && AUTO_APPLY_METHODS[ingestion.matchMethod as LabelMatchMethod]) {
        try {
          const applied = await applyStoredLabelIngestion({ organizationId, actorStaffId, ingestionId: ingestion.id, expectedRowVersion: ingestion.rowVersion });
          if (!applied.ok) console.warn(`[label-batch] ${batchId} p${pageNumber}: matched, not applied (${applied.code}): ${applied.message}`);
        } catch (error) {
          console.warn(`[label-batch] ${batchId} p${pageNumber}: matched, apply failed:`, error);
        }
      }
    } finally {
      // By bytes, not id: a page that failed after its ledger row landed still joins, so a retry finds it.
      await tenantQuery(
        organizationId,
        `UPDATE label_ingestions SET batch_id = $3, page_number = $4
          WHERE organization_id = $1 AND sha256 = $2 AND batch_id IS NULL`,
        [organizationId, pageSha, batchId, pageNumber],
      );
    }
  };

  const landPaperPage = async (pageNumber: number, pageBytes: Buffer, pageName: string) => {
    const stored = await storeOutboundDocumentFromBytes(organizationId, {
      orderId: null,
      orderRef: 'bulk',
      documentType: 'packing_slip',
      platform: 'manual',
      source: 'bulk_upload',
      buffer: pageBytes,
      contentType: 'application/pdf',
      extension: 'pdf',
      filename: pageName,
      uploadedBy: actorStaffId,
      // Same identity as any other unlinked slip upload of these bytes.
      sourceHash: sha256Hex(`bulk|packing_slip|${sha256Hex(pageBytes)}`),
    });
    const documentId = stored.document.id;
    await tenantQuery(
      organizationId,
      `UPDATE documents SET upload_batch_id = $3, upload_page_number = $4
        WHERE organization_id = $1 AND id = $2 AND upload_batch_id IS NULL`,
      [organizationId, documentId, batchId, pageNumber],
    );
    if (stored.document.links.some((link) => link.entityType === 'ORDER')) return;
    try {
      const text = await extractPdfText(pageBytes).catch(() => '');
      candidates ??= loadSlipCandidates(organizationId);
      const match = matchSlipFile({ filename: fileName, text }, await candidates);
      if (match && 'orderId' in match) {
        await attachOutboundDocument(organizationId, { orderId: match.orderId, documentType: 'packing_slip', documentId, uploadedBy: actorStaffId });
      }
    } catch (error) {
      console.warn(`[label-batch] ${batchId} p${pageNumber}: slip stored, not matched:`, error);
    }
  };

  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(PAGE_CONCURRENCY, pending.length) }, async () => {
      while (next < pending.length) {
        const pageNumber = pending[next]!;
        next += 1;
        try {
          const pageBytes = pageCount === 1 ? bytes : await extractPdfPage(source, pageNumber - 1);
          const pageName = labelBatchPageFileName(fileName, pageNumber, pageCount);
          if (stocks[pageNumber - 1] === 'label') await landLabelPage(pageNumber, pageBytes, pageName);
          else await landPaperPage(pageNumber, pageBytes, pageName);
        } catch (error) {
          failedPages.push({ pageNumber, reason: error instanceof Error ? error.message : 'The page could not be stored.' });
        }
      }
    }),
  );
  failedPages.sort((a, b) => a.pageNumber - b.pageNumber);

  const file = await readPrintFileRow(organizationId, batchId);
  return { file: file!, duplicate: claimed.duplicate, failedPages };
}

/** One file and its stored LABEL pages as ledger rows, page order. Null when not this org's. */
export async function getLabelBatch(organizationId: OrgId, batchId: number): Promise<LabelBatchDetail | null> {
  const [file, pageRows] = await Promise.all([
    readPrintFileRow(organizationId, batchId),
    tenantQuery<LabelQueueRow & { page_number: number | null }>(
      organizationId,
      `${labelRowSelectSql(', li.page_number')}
        WHERE li.organization_id = $1 AND li.batch_id = $2 AND li.staged_object_key IS NOT NULL
        ORDER BY li.page_number ASC NULLS LAST, li.id ASC`,
      [organizationId, batchId],
    ),
  ]);
  if (!file) return null;
  return { file, pages: pageRows.rows.map((row) => ({ ...toLabelRow(row), pageNumber: Number(row.page_number ?? 0) })) };
}

/**
 * Delete one file: its label pages, its paperwork pages and its original.
 * Refused — nothing deleted — while any page is on an order (paired, applied
 * or linked); each label page is rechecked by the ingestion writer, so a page
 * paired meanwhile still refuses. Null when the file is not this org's.
 */
export async function deleteLabelBatch(
  organizationId: OrgId,
  actorStaffId: number,
  batchId: number,
): Promise<{ batchId: number; deletedIngestionIds: number[]; deletedDocumentIds: number[] } | null> {
  const found = await tenantQuery<{ id: string }>(organizationId, `SELECT id FROM label_batches WHERE organization_id = $1 AND id = $2`, [organizationId, batchId]);
  if (found.rows.length === 0) return null;
  const pages = await tenantQuery<{ stock: PageStock; id: string; on_order: boolean }>(
    organizationId,
    `SELECT 'label' AS stock, li.id, (li.matched_order_id IS NOT NULL OR li.state = 'APPLIED') AS on_order, li.page_number
       FROM label_ingestions li
      WHERE li.organization_id = $1 AND li.batch_id = $2
     UNION ALL
     SELECT 'paper', d.id, (
              EXISTS (SELECT 1 FROM document_entity_links l
                       WHERE l.organization_id = $1 AND l.document_id = d.id AND l.entity_type = 'ORDER')
              OR (d.entity_type IN ('ORDER', 'SHIPPING_LABEL') AND d.entity_id > 0)
            ), d.upload_page_number
       FROM documents d
      WHERE d.organization_id = $1 AND d.upload_batch_id = $2
      ORDER BY 4 ASC NULLS LAST, 2 ASC`,
    [organizationId, batchId],
  );
  if (pages.rows.some((page) => page.on_order)) {
    throw new LabelIngestionServiceError('INGESTION_NOT_ACTIONABLE', 'A page of this file is on an order — take it off the order before deleting the file.');
  }
  const deletedIngestionIds: number[] = [];
  const deletedDocumentIds: number[] = [];
  for (const page of pages.rows) {
    const id = Number(page.id);
    if (page.stock === 'label') {
      await deleteUnlinkedLabelIngestion({ organizationId, actorStaffId, ingestionId: id });
      deletedIngestionIds.push(id);
    } else {
      await deleteOutboundDocument(organizationId, id, { expectedDocumentType: 'packing_slip' });
      deletedDocumentIds.push(id);
    }
  }
  const deleted = await tenantQuery<{ original_bucket: string | null; original_object_key: string | null }>(
    organizationId,
    `DELETE FROM label_batches b
      WHERE b.organization_id = $1 AND b.id = $2
        AND NOT EXISTS (SELECT 1 FROM label_ingestions li WHERE li.organization_id = $1 AND li.batch_id = $2)
        AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.organization_id = $1 AND d.upload_batch_id = $2)
      RETURNING b.original_bucket, b.original_object_key`,
    [organizationId, batchId],
  );
  const original = deleted.rows[0];
  // Row first, bytes after: a storage failure can only leave an unreachable object, never a file without its original.
  if (original?.original_bucket && original.original_object_key) {
    await gcsAdapter.deleteObject({ bucket: original.original_bucket, objectKey: original.original_object_key }).catch((error: unknown) => {
      console.warn(`[label-batch] ${batchId}: deleted, original not removed from storage:`, error);
    });
  }
  return { batchId, deletedIngestionIds, deletedDocumentIds };
}

/** The original uploaded PDF. Null when the file is not this org's or predates kept originals. */
export async function readLabelBatchOriginal(organizationId: OrgId, batchId: number): Promise<{ bytes: Buffer; fileName: string } | null> {
  const result = await tenantQuery<{ file_name: string; original_bucket: string | null; original_object_key: string | null }>(
    organizationId,
    `SELECT file_name, original_bucket, original_object_key FROM label_batches WHERE organization_id = $1 AND id = $2`,
    [organizationId, batchId],
  );
  const row = result.rows[0];
  if (!row?.original_bucket || !row.original_object_key) return null;
  return { bytes: await gcsAdapter.getObjectBytes({ bucket: row.original_bucket, objectKey: row.original_object_key }), fileName: row.file_name };
}
