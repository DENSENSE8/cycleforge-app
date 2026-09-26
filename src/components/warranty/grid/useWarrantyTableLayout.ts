'use client';

/** The Warranty slot-layout hook — the Warranty CONFIG on the shared {@link useSlotTableLayout} engine. */

import {
  WARRANTY_FIELD_CATALOG,
  WARRANTY_PRODUCT_LAYOUT,
  WARRANTY_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/warranty';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useWarrantyTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: WARRANTY_TABLE_LAYOUT_ID,
    catalog: WARRANTY_FIELD_CATALOG,
    productLayout: WARRANTY_PRODUCT_LAYOUT,
    paintMorph: 'sheet',
    identityFallbackLabel: 'Claim',
    bandLabels: { status: 'Status columns', subtitle: 'Detail columns' },
  });
}
