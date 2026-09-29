import type { ReceivingLineRow } from './receiving-line-row';

/** An identifier-shaped token: has a digit, at least 5 characters (order #, PO #, tracking, serial, SKU). */
const ID_TOKEN = /^(?=.*\d)[^\s,;]{5,}$/;

/**
 * The Find text as needles. A pasted / typed LIST of identifiers ("A, B, C",
 * or one per line) is 2+ id-shaped tokens and matches ANY of them (owner
 * 2026-09-28: bulk-search order and tracking numbers at once); anything else —
 * "bose wave", "bose 251" — stays one phrase.
 */
export function receivingFindNeedles(query: string): string[] {
  const text = query.trim().toLowerCase();
  if (!text) return [];
  const tokens = text.split(/[\s,;]+/).filter(Boolean);
  if (tokens.length >= 2 && tokens.every((token) => ID_TOKEN.test(token))) return [...new Set(tokens)];
  return [text];
}

const canonicalTrackingFragment = (value: string) => value.replace(/[^a-z0-9]/gi, '').toLowerCase();

/** Package lookup accepts the full tracking code or any trailing fragment. */
export function receivingTrackingMatchesQuery(
  tracking: string | null | undefined,
  query: string,
): boolean {
  const stored = canonicalTrackingFragment(tracking ?? '');
  if (!stored) return false;
  return receivingFindNeedles(query).some((needle) => {
    const fragment = canonicalTrackingFragment(needle);
    return fragment.length > 0 && (stored === fragment || stored.endsWith(fragment));
  });
}

/** Local refinement of fetched receiving rows; not an authoritative system lookup. */
export function receivingLineMatchesQuery(row: ReceivingLineRow, query: string): boolean {
  const needles = receivingFindNeedles(query);
  if (needles.length === 0) return true;
  if (receivingTrackingMatchesQuery(row.tracking_number, query)) return true;
  const hay = [
    row.sku,
    row.item_name,
    row.zoho_item_title,
    row.catalog_product_title,
    row.zoho_purchaseorder_number,
    row.source_order_id,
    row.tracking_number,
    row.carrier,
    row.notes,
    String(row.id),
    ...(row.serials ?? []).map((unit) => unit.serial_number),
    ...(row.units ?? []).map((unit) => unit.serial),
  ]
    .filter((value): value is string => value != null)
    .map((value) => value.toLowerCase());
  return needles.some((needle) => hay.some((value) => value.includes(needle)));
}
