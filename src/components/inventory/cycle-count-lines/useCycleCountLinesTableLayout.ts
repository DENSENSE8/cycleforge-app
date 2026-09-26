'use client';

/** The cycle-count-lines slot-layout hook — this family's CONFIG on the shared {@link useSlotTableLayout} engine (cascade resolve,… */

import {
  CYCLECOUNTLINES_FIELD_CATALOG,
  CYCLECOUNTLINES_PRODUCT_LAYOUT,
  CYCLECOUNTLINES_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/cycle-count-lines';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useCycleCountLinesTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: CYCLECOUNTLINES_TABLE_LAYOUT_ID,
    catalog: CYCLECOUNTLINES_FIELD_CATALOG,
    productLayout: CYCLECOUNTLINES_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'Bin',
    bandLabels: { status: 'Line columns', subtitle: 'Under the SKU' },
  });
}
