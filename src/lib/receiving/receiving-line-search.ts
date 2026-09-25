import type { ReceivingLineRow } from './receiving-line-row';

/** Local refinement of fetched receiving rows; not an authoritative system lookup. */
export function receivingLineMatchesQuery(row: ReceivingLineRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const hay: Array<string | null | undefined> = [
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
  ];
  return hay.some((value) => value != null && value.toLowerCase().includes(needle));
}
