'use client';

/** The Catalog slot-layout hook — the Products-catalog CONFIG on the shared {@link useSlotTableLayout} engine. */

import {
  CATALOG_FIELD_CATALOG,
  CATALOG_PRODUCT_LAYOUT,
  CATALOG_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/catalog';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useCatalogTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: CATALOG_TABLE_LAYOUT_ID,
    catalog: CATALOG_FIELD_CATALOG,
    productLayout: CATALOG_PRODUCT_LAYOUT,
    paintMorph: 'sheet',
    identityFallbackLabel: 'SKU',
    bandLabels: { status: 'Status columns', subtitle: 'Detail columns' },
  });
}
