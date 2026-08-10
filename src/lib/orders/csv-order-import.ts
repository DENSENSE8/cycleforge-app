/**
 * CSV order import — the ORDERS vocabulary: canonical fields, header aliases,
 * and the Ready vs Action-required rule.
 *
 * Used by Settings `CsvOrderImport` and, through
 * `@/lib/orders/order-import-descriptor`, by the shared table-import staging
 * mechanism. Server ingest stays on `POST /api/orders/import-csv`.
 *
 * The reader lives in the import seam (`@/lib/tables/import/parse-csv`) — a CSV
 * is not an orders concept. Re-exported here so existing callers keep their
 * import path.
 */

export { parseCsv } from '@/lib/tables/import/parse-csv';

export const CSV_ORDER_CANONICAL_FIELDS = [
  { key: 'order_number', label: 'Order number', required: true },
  { key: 'sku', label: 'SKU', required: false },
  { key: 'quantity', label: 'Quantity', required: false },
  { key: 'customer_name', label: 'Customer name', required: false },
  { key: 'tracking_number', label: 'Tracking number', required: false },
  { key: 'platform', label: 'Platform', required: false },
] as const;

export type CsvOrderCanonicalKey = (typeof CSV_ORDER_CANONICAL_FIELDS)[number]['key'];

export type CsvOrderImportResult = {
  inserted: number;
  skipped: number;
  errors: Array<{ row: number; reason: string }>;
};

export type CsvOrderRowStatus = 'ready' | 'action_required';

type CsvOrderMissingField = CsvOrderCanonicalKey;

/** Best-effort auto-map: normalize header vs aliases. */
export function autoMapCsvOrderHeaders(headers: string[]): Record<string, string> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const mapping: Record<string, string> = {};
  const aliases: Record<CsvOrderCanonicalKey, string[]> = {
    order_number: ['ordernumber', 'orderid', 'order', 'ordno', 'orderno'],
    sku: ['sku', 'itemsku', 'productsku', 'itemnumber', 'itemno'],
    quantity: ['quantity', 'qty', 'count'],
    customer_name: ['customername', 'customer', 'buyer', 'buyername', 'name'],
    tracking_number: ['trackingnumber', 'tracking', 'trackingno'],
    platform: ['platform', 'channel', 'source', 'marketplace'],
  };
  for (const field of CSV_ORDER_CANONICAL_FIELDS) {
    const want = aliases[field.key];
    const hit = headers.find((h) => want.includes(norm(h)));
    if (hit) mapping[field.key] = hit;
  }
  return mapping;
}

function pickMapped(row: Record<string, string>, header: string | undefined): string {
  if (!header) return '';
  const v = row[header];
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Ready vs Action required for a staging row.
 *
 * - Missing order number → Action required (always).
 * - When a SKU column is mapped, blank SKU → Action required (Sheets spirit).
 */
export function classifyCsvOrderStagingRow(
  row: Record<string, string>,
  mapping: Record<string, string>,
): { status: CsvOrderRowStatus; missing: CsvOrderMissingField[] } {
  const missing: CsvOrderMissingField[] = [];
  const orderNumber = pickMapped(row, mapping.order_number);
  if (!orderNumber) missing.push('order_number');
  if (mapping.sku && !pickMapped(row, mapping.sku)) missing.push('sku');

  return {
    status: missing.length === 0 ? 'ready' : 'action_required',
    missing,
  };
}

/** Project a raw CSV row through the mapping (for rail edit + confirm payload). */
export function projectCsvOrderRow(
  row: Record<string, string>,
  mapping: Record<string, string>,
): Record<CsvOrderCanonicalKey, string> {
  return {
    order_number: pickMapped(row, mapping.order_number),
    sku: pickMapped(row, mapping.sku),
    quantity: pickMapped(row, mapping.quantity),
    customer_name: pickMapped(row, mapping.customer_name),
    tracking_number: pickMapped(row, mapping.tracking_number),
    platform: pickMapped(row, mapping.platform),
  };
}

/**
 * Apply canonical field edits back onto the raw CSV row using the current mapping.
 * Unmapped keys are ignored (cannot write without a destination header).
 */
export function applyCsvOrderCanonicalEdits(
  row: Record<string, string>,
  mapping: Record<string, string>,
  edits: Partial<Record<CsvOrderCanonicalKey, string>>,
): Record<string, string> {
  const next = { ...row };
  for (const key of Object.keys(edits) as CsvOrderCanonicalKey[]) {
    const header = mapping[key];
    if (!header) continue;
    const value = edits[key];
    if (value === undefined) continue;
    next[header] = value.trim();
  }
  return next;
}

export async function postCsvOrderImport(body: {
  rows: Record<string, string>[];
  mapping: Record<string, string>;
}): Promise<{ ok: true; result: CsvOrderImportResult } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/orders/import-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as CsvOrderImportResult & { error?: string };
    if (!res.ok) {
      return { ok: false, error: json?.error || 'Import failed.' };
    }
    return {
      ok: true,
      result: {
        inserted: json.inserted ?? 0,
        skipped: json.skipped ?? 0,
        errors: Array.isArray(json.errors) ? json.errors : [],
      },
    };
  } catch {
    return { ok: false, error: 'Network error — could not reach the import endpoint.' };
  }
}
