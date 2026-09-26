/** Paste intake for the To-ship import — the pure half. */

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

/** The canonical fields a capture can carry, in staging-column order. */
const EXTRACTED_ORDER_FIELDS = [
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
function extractedOrderHeaders(): string[] {
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

type ClassifiedPaste =
  | { kind: 'csv'; headers: string[]; rows: Record<string, string>[] }
  | { kind: 'prose' };

/** A header cell longer than this is a sentence, not a column name. */
const MAX_HEADER_CELL = 60;

/** Is this pasted text a CSV/TSV the import can stage, or prose for the assistant? */
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
