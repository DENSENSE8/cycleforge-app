/**
 * Paste intake for the To-ship import — the pure half.
 *
 * Two things can land on the mouth that are not prose: a CSV the operator
 * copied out of a marketplace export, or a screenshot of an orders list. Both
 * end in the SAME staging draft `TableImportFileButton` builds from a file.
 * This module only decides what a paste is, and shapes extracted orders into
 * rows the descriptor's `autoMap` binds without a mapping panel — the headers
 * ARE the canonical labels, so every column lands 1:1.
 *
 * Source stamp (HANDOFF-ai-first §2): a paste never produces keystrokes, so it
 * is never a scan and never touches the wedge machine. The draft carries its
 * origin in `fileName` ("Pasted CSV", "Screenshot · 3 orders") until a `paste`
 * origin earns a place in `TableImportOrigin` — the store today knows `file`
 * and `google_sheets`, and a paste behaves exactly like a file (accepted
 * wholesale, no per-row decisions).
 *
 * Client-safe: no DB, no provider. The server extractor lives in
 * `extract-orders-llm.ts` and imports the row type from here.
 */

import { parseCsv } from '@/lib/tables/import/parse-csv';
import {
  autoMapCsvOrderHeaders,
  CSV_ORDER_CANONICAL_FIELDS,
  type CsvOrderCanonicalKey,
} from '@/lib/orders/csv-order-import';

/** One order line the capture extractor reports. Empty string = not seen. */
export interface ExtractedOrderRow {
  orderNumber: string;
  platform: string;
  itemTitle: string;
  itemNumber: string;
  sku: string;
  quantity: string;
  customerName: string;
  shipByDate: string;
  trackingNumber: string;
}

/**
 * The canonical fields a capture can carry, in staging-column order. Parcel
 * and assignee fields are deliberately absent: an orders list on a screen
 * never shows them, and a column the model cannot see is a column it would
 * be tempted to fill.
 */
export const EXTRACTED_ORDER_FIELDS = [
  'order_number',
  'platform',
  'item_title',
  'item_number',
  'sku',
  'quantity',
  'customer_name',
  'ship_by_date',
  'tracking_number',
] as const satisfies readonly CsvOrderCanonicalKey[];

const FIELD_LABEL: Record<CsvOrderCanonicalKey, string> = Object.fromEntries(
  CSV_ORDER_CANONICAL_FIELDS.map((f) => [f.key, f.label]),
) as Record<CsvOrderCanonicalKey, string>;

const FIELD_VALUE: Record<
  (typeof EXTRACTED_ORDER_FIELDS)[number],
  (row: ExtractedOrderRow) => string
> = {
  order_number: (r) => r.orderNumber,
  platform: (r) => r.platform,
  item_title: (r) => r.itemTitle,
  item_number: (r) => r.itemNumber,
  sku: (r) => r.sku,
  quantity: (r) => r.quantity,
  customer_name: (r) => r.customerName,
  ship_by_date: (r) => r.shipByDate,
  tracking_number: (r) => r.trackingNumber,
};

/** Staging headers for a capture draft — the canonical labels, verbatim. */
export function extractedOrderHeaders(): string[] {
  return EXTRACTED_ORDER_FIELDS.map((key) => FIELD_LABEL[key]);
}

/**
 * Extracted orders → the `{ headers, rows }` `loadTableImportDraft` takes.
 * Headers are canonical labels, so `autoMapCsvOrderHeaders` binds all of them
 * and the operator sees a mapped draft, not a mapping panel.
 */
export function stagingRowsFromExtractedOrders(orders: readonly ExtractedOrderRow[]): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const headers = extractedOrderHeaders();
  const rows = orders.map((order) => {
    const row: Record<string, string> = {};
    for (const key of EXTRACTED_ORDER_FIELDS) {
      row[FIELD_LABEL[key]] = FIELD_VALUE[key](order).trim();
    }
    return row;
  });
  return { headers, rows };
}

export type ClassifiedPaste =
  | { kind: 'csv'; headers: string[]; rows: Record<string, string>[] }
  | { kind: 'prose' };

/** A header cell longer than this is a sentence, not a column name. */
const MAX_HEADER_CELL = 60;

/**
 * Is this pasted text a CSV/TSV the import can stage, or prose for the
 * assistant? A paste is CSV only when it parses to ≥ 2 columns and ≥ 1 data
 * row AND the header binds an order number (or two canonical fields) through
 * the same alias map the file path uses. Prose with commas in it — "show me
 * orders, picks and packers" — parses to columns but binds nothing, so it
 * stays prose and reaches the mouth untouched.
 */
export function classifyPastedText(text: string): ClassifiedPaste {
  const source = text.replace(/^﻿/, '').trim();
  if (!source) return { kind: 'prose' };
  const lineCount = source.split(/\r?\n/).filter((l) => l.trim().length > 0).length;
  if (lineCount < 2) return { kind: 'prose' };

  let parsed: { headers: string[]; rows: Record<string, string>[] };
  try {
    parsed = parseCsv(source);
  } catch {
    return { kind: 'prose' };
  }
  const { headers, rows } = parsed;
  if (headers.length < 2 || rows.length < 1) return { kind: 'prose' };
  if (headers.some((h) => h.length > MAX_HEADER_CELL)) return { kind: 'prose' };

  const mapping = autoMapCsvOrderHeaders(headers);
  const bound = Object.keys(mapping).length;
  if (!mapping.order_number && bound < 2) return { kind: 'prose' };

  return { kind: 'csv', headers, rows };
}

/** The draft's identity line: what it was, and how much of it. */
export function pasteDraftFileName(kind: 'csv' | 'capture', rowCount: number): string {
  if (kind === 'csv') return 'Pasted CSV';
  const noun = rowCount === 1 ? 'order' : 'orders';
  return `Screenshot · ${rowCount} ${noun}`;
}
