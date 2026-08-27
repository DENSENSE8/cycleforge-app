/**
 * CSV/TSV inbound returns vocabulary — Amazon Manage Returns + desk CSV.
 *
 * Bound to the shared table-import seam via
 * {@link INBOUND_RETURNS_IMPORT_DESCRIPTOR}. Server ingest stays on
 * `POST /api/receiving/inbound/import-csv` through {@link deskRowFromCsvRecord}.
 */

export { parseCsv } from '@/lib/tables/import/parse-csv';
import {
  deskRowFromCsvRecord,
  isAmazonNativeReturnsRecord,
} from '@/lib/inbound/desk-csv';

export const CSV_INBOUND_RETURNS_FIELDS = [
  { key: 'order_id', label: 'Order ID', required: true },
  { key: 'asin', label: 'ASIN', required: false },
  { key: 'sku', label: 'SKU', required: false },
  { key: 'item_name', label: 'Item title', required: false },
  { key: 'quantity', label: 'Quantity', required: false },
  { key: 'tracking_number', label: 'Tracking #', required: false },
  { key: 'rma_id', label: 'RMA / Amazon RMA', required: false },
  { key: 'return_reason', label: 'Return reason', required: false },
  { key: 'carrier_code', label: 'Carrier', required: false },
  { key: 'return_status', label: 'Return status', required: false },
  { key: 'source', label: 'Platform', required: false },
  { key: 'listing_url', label: 'Listing URL', required: false },
] as const;

export type CsvInboundReturnsKey = (typeof CSV_INBOUND_RETURNS_FIELDS)[number]['key'];

export type CsvInboundReturnsRowStatus = 'ready' | 'action_required';

export type InboundReturnsImportResult = {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
};

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function pickMapped(row: Record<string, string>, header: string | undefined): string {
  if (!header) return '';
  const v = row[header];
  return typeof v === 'string' ? v.trim() : '';
}

/** Best-effort auto-map for Manage Returns + desk CSV aliases. */
export function autoMapCsvInboundReturnsHeaders(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const aliases: Record<CsvInboundReturnsKey, string[]> = {
    order_id: ['orderid', 'order', 'ordernumber', 'orderno', 'sourceorderid', 'po', 'ponumber'],
    asin: ['asin'],
    sku: ['sku', 'merchantsku', 'productsku', 'itemsku'],
    item_name: ['itemname', 'itemtitle', 'producttitle', 'title', 'product', 'name'],
    quantity: ['quantity', 'qty', 'returnquantity'],
    tracking_number: [
      'trackingid',
      'tracking',
      'trackingnumber',
      'trackingno',
      'returntrackingid',
      'carriertracking',
    ],
    rma_id: ['amazonrmaid', 'rmaid', 'rma', 'rmaref'],
    return_reason: ['returnreason', 'reason'],
    carrier_code: ['returncarrier', 'carrier', 'carriercode'],
    return_status: ['returnrequeststatus', 'returnstatus', 'status'],
    source: ['source', 'sourcetype', 'platform', 'channel', 'kind', 'type'],
    listing_url: ['listingurl', 'listing', 'url', 'asinurl'],
  };
  for (const field of CSV_INBOUND_RETURNS_FIELDS) {
    const want = aliases[field.key];
    const hit = headers.find((h) => want.includes(norm(h)));
    if (hit) mapping[field.key] = hit;
  }
  return mapping;
}

function isCancelledStatus(status: string): boolean {
  const s = status.trim().toLowerCase();
  return s === 'cancelled' || s === 'canceled';
}

/**
 * Ready vs Action required.
 *
 * - Cancelled return request → Action required (discard or fix status)
 * - Missing order id → Action required
 * - No product identity (sku / asin / title) → Action required
 * Tracking is optional for Ready (still preferred for Unbox carton attach).
 */
export function classifyCsvInboundReturnsStagingRow(
  row: Record<string, string>,
  mapping: Record<string, string>,
): { status: CsvInboundReturnsRowStatus; missing: CsvInboundReturnsKey[] } {
  const missing: CsvInboundReturnsKey[] = [];
  const status = pickMapped(row, mapping.return_status);
  if (isCancelledStatus(status)) {
    return { status: 'action_required', missing: ['return_status'] };
  }
  if (!pickMapped(row, mapping.order_id)) missing.push('order_id');
  const namesProduct =
    Boolean(pickMapped(row, mapping.sku))
    || Boolean(pickMapped(row, mapping.asin))
    || Boolean(pickMapped(row, mapping.item_name));
  if (!namesProduct) {
    if (mapping.sku) missing.push('sku');
    else if (mapping.asin) missing.push('asin');
    else missing.push('item_name');
  }
  return {
    status: missing.length === 0 ? 'ready' : 'action_required',
    missing,
  };
}

export function projectCsvInboundReturnsRow(
  row: Record<string, string>,
  mapping: Record<string, string>,
): Record<CsvInboundReturnsKey, string> {
  return {
    order_id: pickMapped(row, mapping.order_id),
    asin: pickMapped(row, mapping.asin),
    sku: pickMapped(row, mapping.sku),
    item_name: pickMapped(row, mapping.item_name),
    quantity: pickMapped(row, mapping.quantity),
    tracking_number: pickMapped(row, mapping.tracking_number),
    rma_id: pickMapped(row, mapping.rma_id),
    return_reason: pickMapped(row, mapping.return_reason),
    carrier_code: pickMapped(row, mapping.carrier_code),
    return_status: pickMapped(row, mapping.return_status),
    source: pickMapped(row, mapping.source),
    listing_url: pickMapped(row, mapping.listing_url),
  };
}

export function applyCsvInboundReturnsCanonicalEdits(
  row: Record<string, string>,
  mapping: Record<string, string>,
  edits: Partial<Record<CsvInboundReturnsKey, string>>,
): Record<string, string> {
  const next = { ...row };
  for (const key of Object.keys(edits) as CsvInboundReturnsKey[]) {
    const header = mapping[key];
    if (!header) continue;
    const value = edits[key];
    if (value === undefined) continue;
    next[header] = value.trim();
  }
  return next;
}

/**
 * Rebuild a desk/Amazon-shaped record from the projected mapping so
 * {@link deskRowFromCsvRecord} can ingest after column remaps.
 */
export function toInboundImportCsvRecord(
  row: Record<string, string>,
  mapping: Record<string, string>,
): Record<string, string> {
  const p = projectCsvInboundReturnsRow(row, mapping);
  // Prefer preserving Amazon-native shape when the source file was Manage Returns
  // so ASIN catalog enrichment and skipReason stay on the ingest path.
  if (isAmazonNativeReturnsRecord(row) || (p.asin && p.order_id)) {
    return {
      'Order ID': p.order_id,
      ASIN: p.asin,
      'Merchant SKU': p.sku,
      'Item Name': p.item_name,
      'Return quantity': p.quantity || '1',
      'Tracking ID': p.tracking_number,
      'Amazon RMA ID': p.rma_id,
      'Return Reason': p.return_reason,
      'Return carrier': p.carrier_code,
      'Return request status': p.return_status || 'Approved',
    };
  }
  return {
    kind: 'return',
    source: p.source || 'amazon',
    order_id: p.order_id,
    sku: p.sku || p.asin,
    item_name: p.item_name,
    qty: p.quantity || '1',
    tracking: p.tracking_number,
    rma_id: p.rma_id,
    return_reason: p.return_reason,
    listing_url: p.listing_url,
    receiving_type: 'RETURN',
  };
}

/** Sanity-check a mapped row can become a DeskImportRow (throws on hard fail). */
export function previewInboundReturnsDeskRow(
  row: Record<string, string>,
  mapping: Record<string, string>,
) {
  return deskRowFromCsvRecord(toInboundImportCsvRecord(row, mapping));
}

export async function postCsvInboundReturnsImport(body: {
  rows: Record<string, string>[];
  mapping: Record<string, string>;
}): Promise<
  | { ok: true; result: InboundReturnsImportResult }
  | { ok: false; error: string }
> {
  try {
    const payloadRows = body.rows.map((row) =>
      toInboundImportCsvRecord(row, body.mapping),
    );
    const res = await fetch('/api/receiving/inbound/import-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: payloadRows }),
    });
    const json = (await res.json()) as InboundReturnsImportResult & {
      success?: boolean;
      error?: string;
      results?: Array<{
        ok: boolean;
        skipped?: boolean;
        receiving_line_id?: number;
        error?: string;
      }>;
    };
    if (!res.ok || json.success === false) {
      return { ok: false, error: json?.error || 'Import failed.' };
    }
    return {
      ok: true,
      result: {
        created: json.created ?? 0,
        updated: json.updated ?? 0,
        skipped: json.skipped ?? 0,
        failed: json.failed ?? 0,
      },
    };
  } catch {
    return { ok: false, error: 'Network error — could not reach the import endpoint.' };
  }
}
