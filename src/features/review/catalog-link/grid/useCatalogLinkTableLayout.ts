'use client';

/** The catalog-link slot-layout hook — the Review · Listing match CONFIG on the shared {@link useSlotTableLayout} engine. */

import {
  CATALOG_LINK_FIELD_CATALOG,
  CATALOG_LINK_PRODUCT_LAYOUT,
  CATALOG_LINK_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/catalog-link';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useCatalogLinkTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: CATALOG_LINK_TABLE_LAYOUT_ID,
    catalog: CATALOG_LINK_FIELD_CATALOG,
    productLayout: CATALOG_LINK_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'Item #',
  });
}
