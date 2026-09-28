/** Which loaded order a wedge scan names — the To ship desk's scan-opens-the-record resolver (DESIGN_SYSTEM.md § Disclosure ladder, L3). */

import { normalizeMarketplaceOrderId } from '@/lib/marketplace-order-id';
import { extractCanonicalTracking } from '@/lib/tracking-format';

/** The row facts a scan can name. */
export interface ScanOrderRow {
  order_id?: string | null;
  shipping_tracking_number?: string | null;
  tracking_numbers?: readonly string[] | null;
  tracking_number_rows?: ReadonlyArray<{ tracking: string }> | null;
}

/** Order-number key: `#`, Unicode dashes and separators never decide a match. */
function orderKey(raw: string | null | undefined): string {
  return normalizeMarketplaceOrderId(raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function rowTrackingKeys(row: ScanOrderRow): string[] {
  const raw = [
    row.shipping_tracking_number,
    ...(row.tracking_numbers ?? []),
    ...(row.tracking_number_rows ?? []).map((t) => t.tracking),
  ];
  const keys: string[] = [];
  for (const value of raw) {
    const key = value ? extractCanonicalTracking(value) : '';
    if (key) keys.push(key);
  }
  return keys;
}

/**
 * The first row (in list order) the scanned value names, or `null`.
 * An order number outranks a tracking number across the WHOLE list: an order
 * whose number is the scan wins over an earlier row whose tracking happens to
 * normalise to the same digits. Tracking runs the carrier normaliser on both
 * sides, so a USPS IMpb (`420`+ZIP prefix) or FedEx GS1 envelope finds the row
 * that stores the human number.
 */
export function matchScannedOrder<T extends ScanOrderRow>(scan: string, rows: readonly T[]): T | null {
  const byNumber = orderKey(scan);
  if (byNumber) {
    const hit = rows.find((row) => orderKey(row.order_id) === byNumber);
    if (hit) return hit;
  }
  const byTracking = extractCanonicalTracking(scan);
  if (!byTracking) return null;
  return rows.find((row) => rowTrackingKeys(row).includes(byTracking)) ?? null;
}
