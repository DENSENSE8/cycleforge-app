/** SKU catalog entry → {@link ItemRecord}. */

import type { ItemRecord } from '@/design-system/components/item-record';

/** The `catalog` object on `GET /api/sku-catalog/{id}`. */
export interface SkuCatalogRecordSource {
  id: number;
  sku?: string | null;
  product_title?: string | null;
  image_url?: string | null;
  upc?: string | null;
  ean?: string | null;
  gtin?: string | null;
  category?: string | null;
}

export function skuCatalogToItemRecords(catalog: SkuCatalogRecordSource): ItemRecord[] {
  const sku = String(catalog.sku ?? '').trim();
  const title = String(catalog.product_title ?? '').trim() || sku || `SKU ${catalog.id}`;

  // The barcode a catalog entry carries, in the order an operator would trust
  // it: the global trade number, then the regional codes it generalizes.
  const barcode =
    String(catalog.gtin ?? '').trim() ||
    String(catalog.upc ?? '').trim() ||
    String(catalog.ean ?? '').trim();

  return [
    {
      id: catalog.id,
      title,
      sku: sku || null,
      // No quantity — see the header. A catalog row counts nothing.
      quantity: null,
      // No grade. A definition has no condition; the units carrying this SKU do.
      conditionGrade: null,
      serials: [],
      unitPrice: null,
      imageUrl: String(catalog.image_url ?? '').trim() || null,
      facts: barcode
        ? [{ id: 'barcode', label: 'Barcode', value: barcode, copyValue: barcode }]
        : undefined,
    },
  ];
}
