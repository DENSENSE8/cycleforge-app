/** Client-side find for an already-painted orders queue. */
import type { ShippedOrder } from '@/types/orders';

export function filterShippedOrdersByQuery(
  rows: readonly ShippedOrder[],
  query: string,
): ShippedOrder[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...rows];

  const hits = rows.filter((row) => shippedOrderSearchHaystack(row).includes(needle));
  if (hits.length === 0) return [];

  const hitIds = new Set(hits.map((row) => row.id));
  const orderIds = new Set(
    hits
      .map((row) => String(row.order_id || '').trim())
      .filter(Boolean),
  );
  if (orderIds.size === 0) return hits;

  const out: ShippedOrder[] = [];
  const seen = new Set<number>();
  for (const row of rows) {
    const orderId = String(row.order_id || '').trim();
    if (!hitIds.has(row.id) && !(orderId && orderIds.has(orderId))) continue;
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

function shippedOrderSearchHaystack(row: ShippedOrder): string {
  const tracking = [
    row.shipping_tracking_number,
    ...(row.tracking_numbers ?? []),
    ...(row.tracking_number_rows ?? []).map((entry) => entry.tracking),
  ]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join('\n');

  return [
    row.order_id,
    String(row.id),
    row.product_title,
    row.sku,
    row.item_number,
    row.serial_number,
    row.fnsku,
    tracking,
    row.account_source,
    row.notes,
    row.condition,
    row.catalog_category,
    row.tester_name,
    row.packer_name,
    row.tested_by_name,
    row.packed_by_name,
  ]
    .filter((value): value is string => Boolean(value && String(value).trim()))
    .join('\n')
    .toLowerCase();
}
