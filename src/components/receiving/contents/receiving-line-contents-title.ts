/**
 * Title precedence for a receiving line contents row — Zoho ITEM title beats
 * catalogue join, which beats the PO line's listing-style `item_name`.
 */
export function receivingLineContentsTitle(fields: {
  zoho_item_title?: string | null;
  catalog_product_title?: string | null;
  item_name?: string | null;
  sku?: string | null;
}): string {
  return (
    fields.zoho_item_title?.trim() ||
    fields.catalog_product_title?.trim() ||
    fields.item_name?.trim() ||
    fields.sku?.trim() ||
    'Untitled item'
  );
}
