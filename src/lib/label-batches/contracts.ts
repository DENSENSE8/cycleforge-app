/**
 * `/api/v1/label-batches` — Uploads on the Labels & docs desk. A batch is one
 * uploaded label PDF; the server splits it and ingests every page as a normal
 * `label_ingestions` row (`batch_id`, `page_number`). The same bytes uploaded
 * again ARE the same batch. Framework-free: the wire types, the query/upload
 * schemas and the pure rules both sides share.
 */
import { z } from 'zod';
import type { LabelPrintRow, PaperworkPrintRow } from '@/lib/label-prints/contracts';
import { addDaysToDateKey, isDateKey, warehouseCivilTimeToInstant } from '@/utils/date';

/** One upload's bound — the whole PDF (each page still obeys the ingestion's own per-file bound). */
export const MAX_LABEL_BATCH_BYTES = 50 * 1024 * 1024;
export const MAX_LABEL_BATCH_PAGES = 500;
export const MAX_LABEL_BATCH_LIST = 500;

export interface LabelBatchRow {
  id: number;
  fileName: string;
  sha256: string;
  pageCount: number;
  byteSize: number;
  uploadedAt: string;
  uploadedBy: string | null;
  /** Pages with ≥1 `label_print_events` row. */
  printedPages: number;
  /** Total print rows across its pages. */
  printCount: number;
  lastPrintedAt: string | null;
  /** Pages matched to an order. */
  pairedPages: number;
  /** Pages waiting on an operator: the buyer has several open orders (the confirmation exception). */
  confirmPages: number;
}

export interface LabelBatchList {
  rows: LabelBatchRow[];
  total: number;
}

export interface LabelBatchPage extends LabelPrintRow {
  pageNumber: number;
}

export interface LabelBatchDetail {
  batch: LabelBatchRow;
  /** Page order. */
  pages: LabelBatchPage[];
  /** The paired orders' slips + manuals, printed or not — in the order their first page appears. */
  paperwork: PaperworkPrintRow[];
}

export interface LabelBatchUploadResult {
  batch: LabelBatchRow;
  /** True when these bytes were already a batch. */
  replayed: boolean;
  pages: { added: number; alreadyOnFile: number; failed: Array<{ pageNumber: number; reason: string }> };
}

export interface LabelBatchFilters {
  q?: string;
  /** Upload date, warehouse civil `YYYY-MM-DD`, inclusive. */
  from?: string;
  to?: string;
}

const dateKey = z.string().trim().refine((value) => isDateKey(value), 'Expected YYYY-MM-DD.');

export const labelBatchListQuerySchema = z.object({
  q: z.string().trim().max(200).optional().transform((value) => value || undefined),
  from: dateKey.optional(),
  to: dateKey.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LABEL_BATCH_LIST).default(200),
}).strict();

export type LabelBatchListQuery = z.output<typeof labelBatchListQuerySchema>;

export const labelBatchUploadFieldsSchema = z.object({ clientEventId: z.uuid() }).strict();

/**
 * The upload window as instants `[fromIso, toIso)`: `from` opens at that
 * warehouse day's midnight, `to` closes at the NEXT day's midnight (the day is
 * inside). Either side may be open; a reversed pair is swapped.
 */
export function labelBatchUploadWindow(input: { from?: string; to?: string }): { fromIso: string | null; toIso: string | null } {
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
  const date = { type: 'string', format: 'date' };
  return {
    '/api/v1/label-batches': {
      get: {
        parameters: [
          { name: 'q', in: 'query', required: false, schema: { type: 'string', maxLength: 200 }, description: "File name, a page's tracking number or order ref" },
          { name: 'from', in: 'query', required: false, schema: date, description: 'Upload date on or after (warehouse civil date)' },
          { name: 'to', in: 'query', required: false, schema: date, description: 'Upload date on or before (warehouse civil date)' },
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: MAX_LABEL_BATCH_LIST } },
        ],
        responses: { '200': { description: 'Uploaded label PDFs, newest upload first ({ rows, total })' }, '400': rejected('Invalid query') },
      },
      post: {
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file', 'clientEventId'],
                properties: { file: { type: 'string', format: 'binary', description: 'application/pdf' }, clientEventId: { type: 'string', format: 'uuid' } },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Batch created; every page ingested as a label ({ batch, replayed: false, pages })' },
          '200': { description: 'These bytes are already a batch — returned as is, nothing ingested ({ batch, replayed: true, pages })' },
          '400': rejected('Rejected (not a PDF, too large, too many pages)'),
        },
      },
    },
    '/api/v1/label-batches/{id}': {
      get: {
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } }],
        responses: {
          '200': { description: "One batch: its pages (label rows + pageNumber, page order) and the paired orders' paperwork" },
          '404': rejected('Not found'),
        },
      },
    },
  };
}
