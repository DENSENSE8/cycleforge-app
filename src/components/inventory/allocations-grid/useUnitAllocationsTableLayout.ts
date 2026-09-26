'use client';

/** The unit-allocations slot-layout hook — this family's CONFIG on the shared {@link useSlotTableLayout} engine. */

import {
  UNIT_ALLOCATIONS_FIELD_CATALOG,
  UNIT_ALLOCATIONS_PRODUCT_LAYOUT,
  UNIT_ALLOCATIONS_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/unit-allocations';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useUnitAllocationsTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: UNIT_ALLOCATIONS_TABLE_LAYOUT_ID,
    catalog: UNIT_ALLOCATIONS_FIELD_CATALOG,
    productLayout: UNIT_ALLOCATIONS_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'Order',
    bandLabels: { status: 'Allocation columns', subtitle: 'Under the title' },
  });
}
