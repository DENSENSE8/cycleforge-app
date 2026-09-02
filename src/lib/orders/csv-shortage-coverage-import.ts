/**
 * CSV shortage-coverage import — canonical fields, Amazon OOS header aliases,
 * and the Ready vs Action-required rule.
 *
 * Display of coverage is {@link formatShortageCoverage} — this module only
 * maps file columns onto facts. Confirm writes coverage onto an existing
 * order; it never mints one.
 */

import {
  normalizeShortageCoverageToken,
  parseShortageShortQty,
  shortageCoverageFace,
  shortageRowNamesProduct,
  type ShortageCoverageFacts,
  type TableImportTriageStatus,
} from '@/lib/orders/shortage-coverage';

export const CSV_SHORTAGE_COVERAGE_FIELDS = [
  { key: 'order_number', label: 'Order number', required: true },
  { key: 'item_title', label: 'Product name', required: false },
  { key: 'sku', label: 'SKU', required: false },
  { key: 'item_number', label: 'Item number', required: false },
  { key: 'short_qty', label: 'Short qty', required: true },
  { key: 'ship_by_date', label: 'Ship by date', required: false },
  { key: 'po_number', label: 'PO', required: false },
  { key: 'inbound_tracking', label: 'Inbound tracking', required: false },
  { key: 'eta', label: 'ETA', required: false },
] as const;

export type CsvShortageCoverageKey = (typeof CSV_SHORTAGE_COVERAGE_FIELDS)[number]['key'];

export type CsvShortageCoverageRowStatus = TableImportTriageStatus;

function pickMapped(row: Record<string, string>, header: string | undefined): string {
  if (!header) return '';
  const v = row[header];
  return typeof v === 'string' ? v.trim() : '';
}

function normHeader(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Amazon OOS / late ship-by demand sheets (Order ID · Product Name · Qty ·
 * TRK Link for item · Estimate Delivery Date). `Late` is days-overdue, not a
 * date — it is deliberately unaliased. Generic `tracking` lands on inbound,
 * never outbound, because this family has no outbound tracking field.
 */
export function autoMapCsvShortageCoverageHeaders(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const aliases: Record<CsvShortageCoverageKey, string[]> = {
    order_number: ['ordernumber', 'orderid', 'order', 'ordno', 'orderno', 'amazonorderid'],
    item_title: [
      'itemtitle',
      'producttitle',
      'product',
      'title',
      'description',
      'itemname',
      'productname',
    ],
    sku: ['sku', 'itemsku', 'productsku', 'sellersku'],
    item_number: ['itemnumber', 'itemno', 'itemid', 'listingid', 'asin'],
    short_qty: ['shortqty', 'qty', 'quantity', 'count', 'units'],
    ship_by_date: ['shipbydate', 'shipby', 'shipdate', 'duedate', 'deliverby'],
    po_number: ['po', 'ponumber', 'ponum', 'purchaseorder', 'vendorpo'],
    inbound_tracking: [
      'inboundtracking',
      'inboundtrk',
      'trklinkforitem',
      'trklink',
      'suppliertracking',
      'tracking',
      'trackingnumber',
      'trackingno',
    ],
    eta: [
      'eta',
      'etadate',
      'estimatedeliverydate',
      'estimateddelivery',
      'deliverydate',
      'expecteddate',
    ],
  };
  for (const field of CSV_SHORTAGE_COVERAGE_FIELDS) {
    const want = aliases[field.key];
    const hit = headers.find((h) => want.includes(normHeader(h)));
    if (hit) mapping[field.key] = hit;
  }
  return mapping;
}

export function classifyCsvShortageCoverageRow(
  row: Record<string, string>,
  mapping: Record<string, string>,
): { status: CsvShortageCoverageRowStatus; missing: CsvShortageCoverageKey[] } {
  const missing: CsvShortageCoverageKey[] = [];
  const orderNumber = pickMapped(row, mapping.order_number);
  if (!orderNumber) missing.push('order_number');

  const sku = pickMapped(row, mapping.sku);
  const itemNumber = pickMapped(row, mapping.item_number);
  const itemTitle = pickMapped(row, mapping.item_title);
  if (!shortageRowNamesProduct({ sku, itemNumber, itemTitle })) {
    missing.push('item_title');
  }

  if (parseShortageShortQty(pickMapped(row, mapping.short_qty)) == null) {
    missing.push('short_qty');
  }

  return {
    status: missing.length === 0 ? 'ready' : 'action_required',
    missing,
  };
}

export function projectCsvShortageCoverageRow(
  row: Record<string, string>,
  mapping: Record<string, string>,
): Record<CsvShortageCoverageKey, string> {
  return {
    order_number: pickMapped(row, mapping.order_number),
    item_title: pickMapped(row, mapping.item_title),
    sku: pickMapped(row, mapping.sku),
    item_number: pickMapped(row, mapping.item_number),
    short_qty: pickMapped(row, mapping.short_qty),
    ship_by_date: pickMapped(row, mapping.ship_by_date),
    po_number: pickMapped(row, mapping.po_number),
    inbound_tracking: pickMapped(row, mapping.inbound_tracking),
    eta: pickMapped(row, mapping.eta),
  };
}

export function shortageCoverageFactsFromProjected(
  projected: Record<CsvShortageCoverageKey, string>,
): ShortageCoverageFacts {
  return {
    poNumber: normalizeShortageCoverageToken(projected.po_number),
    inboundTracking: normalizeShortageCoverageToken(projected.inbound_tracking),
    eta: normalizeShortageCoverageToken(projected.eta),
  };
}

export function formatProjectedShortageCoverage(
  projected: Record<CsvShortageCoverageKey, string>,
): string {
  return shortageCoverageFace(shortageCoverageFactsFromProjected(projected));
}

export function applyCsvShortageCoverageCanonicalEdits(
  row: Record<string, string>,
  mapping: Record<string, string>,
  edits: Partial<Record<CsvShortageCoverageKey, string>>,
): Record<string, string> {
  const next = { ...row };
  for (const key of Object.keys(edits) as CsvShortageCoverageKey[]) {
    const header = mapping[key];
    if (!header) continue;
    const value = edits[key];
    if (value === undefined) continue;
    next[header] = value.trim();
  }
  return next;
}

export type CsvShortageCoverageImportResult = {
  updated: number;
  skipped: number;
  errors: Array<{ row: number; reason: string }>;
};

export async function postCsvShortageCoverageImport(body: {
  rows: Record<string, string>[];
  mapping: Record<string, string>;
}): Promise<
  { ok: true; result: CsvShortageCoverageImportResult } | { ok: false; error: string }
> {
  try {
    const res = await fetch('/api/orders/shortage-coverage-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as CsvShortageCoverageImportResult & { error?: string };
    if (!res.ok) {
      return { ok: false, error: json?.error || 'Import failed.' };
    }
    return {
      ok: true,
      result: {
        updated: json.updated ?? 0,
        skipped: json.skipped ?? 0,
        errors: Array.isArray(json.errors) ? json.errors : [],
      },
    };
  } catch {
    return { ok: false, error: 'Network error — could not reach the import endpoint.' };
  }
}
