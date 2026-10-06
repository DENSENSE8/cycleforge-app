/**
 * `/api/v1/label-batches` — the ONE upload route of the Labels & docs desk. A
 * batch is one uploaded PDF (a "file" on Bulk): the server keeps the original,
 * classifies every page by its size and lands 4×6-class pages as
 * `label_ingestions` rows (`batch_id`, `page_number`) and every other page as a
 * `packing_slip` document (`upload_batch_id`, `upload_page_number`). The same
 * bytes uploaded again ARE the same file. Framework-free: the wire types, the
 * upload schema and the pure rules both sides share.
 */
import { z } from 'zod';
import type { LabelPrintRow } from '@/lib/label-prints/contracts';
import type { PrintFileRow } from '@/lib/label-prints/print-file-contracts';
import { addDaysToDateKey, warehouseCivilTimeToInstant } from '@/utils/date';

/** One upload's bound — the whole PDF (each label page still obeys the ingestion's own per-file bound). */
export const MAX_LABEL_BATCH_BYTES = 50 * 1024 * 1024;
export const MAX_LABEL_BATCH_PAGES = 500;

export interface LabelBatchPage extends LabelPrintRow {
  pageNumber: number;
}

/** `GET /api/v1/label-batches/{id}` — the file and its LABEL pages as ledger rows (an order slot files them). */
export interface LabelBatchDetail {
  file: PrintFileRow;
  /** Page order. */
  pages: LabelBatchPage[];
}

/** `stock=label`: every page is a shipping label and nothing is auto-applied (an order slot's upload). Absent: each page by its size. */
export const labelBatchUploadFieldsSchema = z
  .object({ clientEventId: z.uuid(), stock: z.literal('label').optional() })
  .strict();

/**
 * A civil-day window as instants `[fromIso, toIso)`: `from` opens at that
 * warehouse day's midnight, `to` closes at the NEXT day's midnight (the day is
 * inside). Either side may be open; a reversed pair is swapped.
 */
export function warehouseDayWindow(input: { from?: string; to?: string }): { fromIso: string | null; toIso: string | null } {
  let { from, to } = input;
  if (from && to && from > to) [from, to] = [to, from];
  const start = from ? warehouseCivilTimeToInstant(from, '00:00') : null;
  const end = to ? warehouseCivilTimeToInstant(addDaysToDateKey(to, 1), '00:00') : null;
  return { fromIso: start?.toISOString() ?? null, toIso: end?.toISOString() ?? null };
}

const MAX_FILE_NAME = 255;

/** The uploaded file's name as a safe basename: last path segment, trimmed, ≤255 chars, never empty. */
export function labelBatchFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop()?.trim() ?? '';
  return (base || 'labels.pdf').slice(0, MAX_FILE_NAME).trim();
}

/**
 * Each page's own file: `<base>-p<n>.pdf`; a one-page PDF keeps its name. The
 * base is trimmed so the result stays a valid ingestion basename (≤255).
 */
export function labelBatchPageFileName(fileName: string, pageNumber: number, pageCount: number): string {
  if (pageCount === 1) return fileName;
  const suffix = `-p${pageNumber}.pdf`;
  const base = fileName.replace(/\.pdf$/i, '').slice(0, MAX_FILE_NAME - suffix.length).trim() || 'labels';
  return `${base}${suffix}`;
}

export function buildLabelBatchOpenApi(): Record<string, unknown> {
  const error = { $ref: '#/components/schemas/Error' };
  const rejected = (description: string) => ({ description, content: { 'application/json': { schema: error } } });
  const id = { name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } };
  return {
    '/api/v1/label-batches': {
      post: {
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file', 'clientEventId'],
                properties: {
                  file: { type: 'string', format: 'binary', description: 'application/pdf' },
                  clientEventId: { type: 'string', format: 'uuid' },
                  stock: { type: 'string', enum: ['label'], description: 'Every page is a shipping label, nothing auto-applied (an order slot). Absent: each page by its size — 4×6-class → label, else packing slip' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'File stored; its pages landed and were matched to orders silently ({ file, duplicate: false, failedPages })' },
          '200': { description: 'These bytes are already a file — returned as is, missing pages landed ({ file, duplicate: true, failedPages })' },
          '400': rejected('Rejected (not a PDF, too large, too many pages)'),
        },
      },
    },
    '/api/v1/label-batches/{id}': {
      get: {
        parameters: [id],
        responses: {
          '200': { description: 'One file and its label pages as ledger rows (label rows + pageNumber, page order): { file, pages }' },
          '404': rejected('Not found'),
        },
      },
      delete: {
        parameters: [id],
        responses: {
          '200': { description: 'File deleted with its label pages and paperwork pages ({ batchId, deletedIngestionIds, deletedDocumentIds })' },
          '404': rejected('Not found'),
          '409': rejected('A page is matched or applied to an order — nothing deleted'),
        },
      },
    },
  };
}
