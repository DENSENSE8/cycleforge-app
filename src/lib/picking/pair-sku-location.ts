/**
 * Pair a SKU to its home bin from the phone (owner 2026-09-29; 2026-10-08) — one writer for every
 * way the picker names the bin: a scanned bin label, a scanned or keyed tote (paired to the shelf the
 * tote is parked on), or a location chosen in the stock drill-down. The code must be a real location
 * (`GET /api/locations/:barcode`); it becomes the SKU's home bin (`POST /api/update-sku-location`,
 * `bin.set`). Pairing is only pairing: no take / put-away count follows.
 */

import { unwrapScannedLocation } from '@/lib/barcode-routing';
import { parseToteRef, type StockTote } from '@/lib/inventory/stock-places';
import { WAREHOUSE_PATHS } from '@/lib/nav/route-tree';

/** The shelf an open tote is parked on, by `H-12` / `12` / an external tote code. */
async function toteShelfBarcode(raw: string): Promise<string> {
  const ref = parseToteRef(raw);
  if (!ref) throw new Error('Key the tote number');
  const face = 'id' in ref ? `H-${ref.id}` : ref.code;
  const response = await fetch('/api/stock-places', { credentials: 'include', cache: 'no-store' });
  const body = (await response.json().catch(() => null)) as { totes?: StockTote[]; error?: string } | null;
  if (!response.ok) throw new Error(body?.error || `Couldn't read totes (${response.status})`);
  const tote = (body?.totes ?? []).find((t) =>
    'id' in ref ? t.id === ref.id : t.code.toUpperCase() === ref.code.toUpperCase(),
  );
  if (!tote) throw new Error(`"${face}" is not a location or an open tote`);
  if (!tote.physicalLocationBarcode) throw new Error(`${tote.code} isn't parked on a shelf — pair the shelf instead`);
  return tote.physicalLocationBarcode;
}

/**
 * Write `sku`'s home bin from a scanned or chosen code; a tote resolves to the shelf it is parked on.
 * `as: 'tote'` skips the location lookup (the keyed tote pad). Resolves to the location's barcode.
 */
export async function pairSkuToLocation(sku: string, raw: string, { as = 'auto' }: { as?: 'auto' | 'tote' } = {}): Promise<string> {
  const code = unwrapScannedLocation(raw);
  if (!code || !sku) throw new Error('Nothing to pair');
  let barcode: string;
  if (as === 'tote') {
    barcode = await toteShelfBarcode(code);
  } else {
    const lookup = await fetch(`/api/locations/${encodeURIComponent(code)}`, { credentials: 'include', cache: 'no-store' });
    if (lookup.status === 404) {
      barcode = await toteShelfBarcode(code);
    } else {
      const found = (await lookup.json().catch(() => null)) as { location?: { barcode?: string | null } } | null;
      if (!lookup.ok || !found?.location) throw new Error(`Couldn't read that location (${lookup.status})`);
      barcode = found.location.barcode?.trim() || code;
    }
  }
  const res = await fetch('/api/update-sku-location', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sku, location: barcode }),
  });
  const body = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
  if (!res.ok || !body?.success) throw new Error(body?.error || `Pairing failed (${res.status})`);
  return barcode;
}

/** Query keys the stock drill-down carries while it is choosing a location to pair `sku` to. */
export const STOCK_PAIR_PARAM = 'pair';
export const STOCK_PAIR_RETURN_PARAM = 'return';

/** The stock drill-down opened to choose the location for `sku` by hand (no label to scan). */
export function stockPairHref(sku: string, returnHref: string): string {
  const params = new URLSearchParams({ [STOCK_PAIR_PARAM]: sku, [STOCK_PAIR_RETURN_PARAM]: returnHref });
  return `${WAREHOUSE_PATHS.stock}?${params.toString()}`;
}
