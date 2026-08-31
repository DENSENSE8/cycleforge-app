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

import { inferMarketplaceFromOrderId } from '@/lib/marketplace-order-id';

/**
 * The CSV lane's canonical vocabulary — deliberately the same field set the
 * Google-Sheet adapter binds (`sources/google-sheet-rows.ts`), because the two
 * lanes read the same operator-authored order lists. A field the writer accepts
 * but this list omits is silently DROPPED on import, which is how item title,
 * ship-by, condition and note were being thrown away until 2026-08-19.
 */
export const CSV_ORDER_CANONICAL_FIELDS = [
  { key: 'order_number', label: 'Order number', required: true },
  { key: 'item_title', label: 'Item title', required: false },
  { key: 'sku', label: 'SKU', required: false },
  { key: 'item_number', label: 'Item number', required: false },
  { key: 'quantity', label: 'Quantity', required: false },
  { key: 'condition', label: 'Condition', required: false },
  { key: 'customer_name', label: 'Customer name', required: false },
  { key: 'ship_by_date', label: 'Ship by date', required: false },
  { key: 'tracking_number', label: 'Tracking number', required: false },
  { key: 'platform', label: 'Platform', required: false },
  { key: 'note', label: 'Note', required: false },
  // Order Intake & Acknowledgment (2026-08-30): the parcel + assignment slice
  // of `CanonicalOrderIntake`. Optional columns — a file without them stages
  // exactly as before; a file with them carries the parcel onto the order.
  { key: 'weight_oz', label: 'Weight (oz)', required: false },
  { key: 'dim_l', label: 'Length (in)', required: false },
  { key: 'dim_w', label: 'Width (in)', required: false },
  { key: 'dim_h', label: 'Height (in)', required: false },
  { key: 'assignee_tech', label: 'Fulfillment assignee', required: false },
  { key: 'assignee_packer', label: 'Pack assignee', required: false },
] as const;

export type CsvOrderCanonicalKey = (typeof CSV_ORDER_CANONICAL_FIELDS)[number]['key'];

export type CsvOrderImportResult = {
  inserted: number;
  /** Existing orders the writer BACKFILLED (additive — blanks only). */
  updated: number;
  /** In-batch duplicate order numbers, first occurrence wins. */
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
    // `itemnumber` / `itemno` moved OFF `sku` when `item_number` gained a field
    // of its own. They were never SKUs: a marketplace item number (an ASIN, an
    // eBay listing id) resolves through `sku_platform_ids.platform_item_id`,
    // while the sku path queries `sku_catalog.sku` — so a header literally
    // named "Item Number" landing in `sku` sent every row down a lookup that
    // could only miss. Aliases must not overlap across fields; two entries
    // claiming one header makes the winner depend on field order.
    item_title: ['itemtitle', 'producttitle', 'product', 'title', 'description', 'itemname', 'productname'],
    sku: ['sku', 'itemsku', 'productsku'],
    item_number: ['itemnumber', 'itemno', 'itemid', 'listingid', 'asin'],
    quantity: ['quantity', 'qty', 'count'],
    condition: ['condition', 'itemcondition', 'grade'],
    customer_name: ['customername', 'customer', 'buyer', 'buyername', 'name'],
    ship_by_date: ['shipbydate', 'shipby', 'shipdate', 'duedate', 'deliverby'],
    tracking_number: ['trackingnumber', 'tracking', 'trackingno'],
    platform: ['platform', 'channel', 'source', 'marketplace'],
    note: ['note', 'notes', 'comment', 'comments', 'remarks'],
    // Parcel: `weight`/`length`/`width`/`height` are the words operator sheets
    // actually use; the `oz`/`in`-suffixed forms come from carrier exports.
    weight_oz: ['weight', 'weightoz', 'weightounces', 'parcelweight', 'oz'],
    dim_l: ['length', 'lengthin', 'diml', 'parcellength'],
    dim_w: ['width', 'widthin', 'dimw', 'parcelwidth'],
    dim_h: ['height', 'heightin', 'dimh', 'parcelheight'],
    assignee_tech: ['tester', 'tech', 'technician', 'assignedto', 'assigneetech'],
    assignee_packer: ['packer', 'assigneepacker', 'packedby'],
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
 * - When a SKU column is mapped, blank SKU → Action required (Sheets spirit) —
 *   UNLESS the row carries an item number or an item title, either of which
 *   names the product just as well — the writer resolves the catalog by SKU, by
 *   `sku_platform_ids.platform_item_id`, or by `product_title`. Marketplace
 *   exports routinely fill one identifier and not the others (an Amazon order
 *   list carries the ASIN and leaves the seller SKU blank; its eBay rows carry
 *   neither and name the product only in the title), so without this every row
 *   of such a file would be Action required the moment the operator mapped
 *   their SKU column at all.
 */
export function classifyCsvOrderStagingRow(
  row: Record<string, string>,
  mapping: Record<string, string>,
): { status: CsvOrderRowStatus; missing: CsvOrderMissingField[] } {
  const missing: CsvOrderMissingField[] = [];
  const orderNumber = pickMapped(row, mapping.order_number);
  if (!orderNumber) missing.push('order_number');
  // Any of the three identifiers names the product well enough to import: the
  // writer resolves the catalog by SKU, by item number, OR by title.
  const namesProduct =
    Boolean(pickMapped(row, mapping.item_number)) || Boolean(pickMapped(row, mapping.item_title));
  if (mapping.sku && !pickMapped(row, mapping.sku) && !namesProduct) missing.push('sku');

  // Platform acknowledgment (Order Intake & Acknowledgment ship): an Amazon
  // 3-7-7 / eBay 2-5-5 order number names its own channel and stays Ready with
  // no platform column at all. An unknown-shaped id with no mapped, non-blank
  // platform value has no channel anyone can vouch for → Action required.
  if (
    orderNumber
    && inferMarketplaceFromOrderId(orderNumber) === null
    && !pickMapped(row, mapping.platform)
  ) {
    missing.push('platform');
  }

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
    item_title: pickMapped(row, mapping.item_title),
    sku: pickMapped(row, mapping.sku),
    item_number: pickMapped(row, mapping.item_number),
    quantity: pickMapped(row, mapping.quantity),
    condition: pickMapped(row, mapping.condition),
    customer_name: pickMapped(row, mapping.customer_name),
    ship_by_date: pickMapped(row, mapping.ship_by_date),
    tracking_number: pickMapped(row, mapping.tracking_number),
    platform: pickMapped(row, mapping.platform),
    note: pickMapped(row, mapping.note),
    weight_oz: pickMapped(row, mapping.weight_oz),
    dim_l: pickMapped(row, mapping.dim_l),
    dim_w: pickMapped(row, mapping.dim_w),
    dim_h: pickMapped(row, mapping.dim_h),
    assignee_tech: pickMapped(row, mapping.assignee_tech),
    assignee_packer: pickMapped(row, mapping.assignee_packer),
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
        updated: json.updated ?? 0,
        skipped: json.skipped ?? 0,
        errors: Array.isArray(json.errors) ? json.errors : [],
      },
    };
  } catch {
    return { ok: false, error: 'Network error — could not reach the import endpoint.' };
  }
}
