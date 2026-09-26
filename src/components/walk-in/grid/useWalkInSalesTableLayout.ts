'use client';

/** Walk-in sales slot-layout hook — this family's CONFIG on useSlotTableLayout. */

import {
  WALKINSALES_FIELD_CATALOG,
  WALKINSALES_PRODUCT_LAYOUT,
  WALKINSALES_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/walk-in-sales';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useWalkInSalesTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: WALKINSALES_TABLE_LAYOUT_ID,
    catalog: WALKINSALES_FIELD_CATALOG,
    productLayout: WALKINSALES_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'Sale',
    bandLabels: { status: 'Sale columns', subtitle: 'Under the title' },
  });
}
