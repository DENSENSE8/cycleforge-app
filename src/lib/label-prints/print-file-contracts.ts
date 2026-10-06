/**
 * Labels & docs › Bulk — the FILE list (operator 2026-10-06): one row per
 * uploaded PDF (`label_batches` row), newest first, a Printed badge per file.
 *
 * An upload is ONE file. Each page is classified by its size
 * ({@link classifyPageStock}): 4×6-class pages are shipping labels (label
 * ingestions, 4×6 printer), everything else is paperwork (a packing-slip
 * document per page, Letter printer). A mixed PDF splits by page. Pages are
 * matched to orders silently; the file list never asks the operator.
 *
 * The sidebar owns every control: Find, Sort, Print status, Uploaded and
 * Printed date windows. Day headers in the list follow the active sort's
 * date (upload day, or last-printed day).
 */
import { z } from 'zod';

export const PAGE_STOCKS = ['label', 'paper'] as const;
/** `label` → 4×6 station; `paper` → Letter station. */
export type PageStock = (typeof PAGE_STOCKS)[number];

const PT_PER_INCH = 72;
/** A label page's short side is at most 4.5in and its long side at most 9in (4×6, 4×8, 6×4 …). */
const LABEL_MAX_SHORT_PT = 4.5 * PT_PER_INCH;
const LABEL_MAX_LONG_PT = 9 * PT_PER_INCH;

/** Page size in PDF points → stock. Letter / A4 / half-letter are paper. */
export function classifyPageStock(widthPt: number, heightPt: number): PageStock {
  const short = Math.min(widthPt, heightPt);
  const long = Math.max(widthPt, heightPt);
  return short <= LABEL_MAX_SHORT_PT && long <= LABEL_MAX_LONG_PT ? 'label' : 'paper';
}

export const PRINT_FILE_SORT_PARAM = 'sort';
/** `newest` (default) / `oldest` by upload time; `last-printed` newest print first, never-printed last. */
export const PRINT_FILE_SORTS = ['newest', 'oldest', 'last-printed'] as const;
export type PrintFileSort = (typeof PRINT_FILE_SORTS)[number];
export const PRINT_FILE_SORT_LABEL: Readonly<Record<PrintFileSort, string>> = {
  newest: 'Newest uploaded',
  oldest: 'Oldest uploaded',
  'last-printed': 'Last printed',
};

/** Print status — ONE param; absence = All. */
export const PRINT_FILE_STATUS_PARAM = 'printing';
export const PRINT_FILE_STATUSES = ['not-printed', 'partly', 'printed'] as const;
export type PrintFileStatus = (typeof PRINT_FILE_STATUSES)[number];
export const PRINT_FILE_STATUS_LABEL: Readonly<Record<'all' | PrintFileStatus, string>> = {
  all: 'All',
  'not-printed': 'Not printed',
  partly: 'Partly printed',
  printed: 'Printed',
};

/** Date windows, YYYY-MM-DD inclusive, in the org's civil day. */
export const PRINT_FILE_UPLOADED_FROM_PARAM = 'from';
export const PRINT_FILE_UPLOADED_TO_PARAM = 'to';
export const PRINT_FILE_PRINTED_FROM_PARAM = 'printedFrom';
export const PRINT_FILE_PRINTED_TO_PARAM = 'printedTo';
/** Find — file name, tracking on any page, order number of any matched page. */
export const PRINT_FILE_QUERY_PARAM = 'q';

export const PRINT_FILE_PAGE_SIZE = 100;
export const MAX_PRINT_FILE_PAGE_SIZE = 200;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const printFileQuerySchema = z
  .object({
    sort: z.enum(PRINT_FILE_SORTS).default('newest'),
    printing: z.enum(PRINT_FILE_STATUSES).optional(),
    from: day.optional(),
    to: day.optional(),
    printedFrom: day.optional(),
    printedTo: day.optional(),
    q: z.string().trim().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(MAX_PRINT_FILE_PAGE_SIZE).default(PRINT_FILE_PAGE_SIZE),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();
export type PrintFileQuery = z.input<typeof printFileQuerySchema>;
export type PrintFileParsedQuery = z.output<typeof printFileQuerySchema>;

/** One uploaded file. */
export interface PrintFileRow {
  /** `label_batches.id`. */
  id: number;
  fileName: string;
  pageCount: number;
  labelPages: number;
  paperPages: number;
  byteSize: number;
  uploadedAt: string;
  uploadedBy: string | null;
  /** Pages with ≥1 successful print. `printedPages === pageCount` → Printed. */
  printedPages: number;
  lastPrintedAt: string | null;
  lastPrintedBy: string | null;
  lastStationName: string | null;
  /** Pages paired (or matched) to an order — the silent matcher's result. */
  matchedPages: number;
  /** Same-origin bytes of the ORIGINAL uploaded PDF (preview). */
  src: string;
}

export function printFileStatus(row: Pick<PrintFileRow, 'printedPages' | 'pageCount'>): PrintFileStatus {
  if (row.printedPages <= 0) return 'not-printed';
  return row.printedPages >= row.pageCount ? 'printed' : 'partly';
}

/** One page of a file — what Print sends, in page order. */
export interface PrintFilePage {
  pageNumber: number;
  stock: PageStock;
  /** Label pages: `label_ingestions.id`. */
  ingestionId: number | null;
  /** Paper pages: the packing-slip `documents.id`; label pages: the applied document, if any. */
  documentId: number | null;
  /** Same-origin bytes of this one page. */
  src: string;
  orderId: number | null;
  orderRef: string | null;
  /** `matched` = paired/applied to an order; `review` = matched but uncertain / held; `unmatched` = no order found. */
  match: 'matched' | 'review' | 'unmatched';
  printCount: number;
  lastPrintedAt: string | null;
}

export interface PrintFileDetail extends PrintFileRow {
  pages: PrintFilePage[];
}

export interface PrintFileQueue {
  rows: PrintFileRow[];
  /** Rows matching every filter before limit/offset. */
  total: number;
  /** Per print status under every OTHER filter — the sidebar counts. */
  counts: Record<'all' | PrintFileStatus, number>;
}

/** `POST /api/v1/label-batches` response for the UI. Re-uploading identical bytes returns the existing file. */
export interface PrintFileUploadResult {
  file: PrintFileRow;
  duplicate: boolean;
  /** Pages that could not be stored (the rest landed). Matching never fails a page. */
  failedPages: Array<{ pageNumber: number; reason: string }>;
}
