'use client';

/** The part-compatibility slot-layout hook — this family's CONFIG on the shared {@link useSlotTableLayout} engine. */

import {
  PART_COMPATIBILITY_FIELD_CATALOG,
  PART_COMPATIBILITY_PRODUCT_LAYOUT,
  PART_COMPATIBILITY_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/part-compatibility';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function usePartCompatibilityTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: PART_COMPATIBILITY_TABLE_LAYOUT_ID,
    catalog: PART_COMPATIBILITY_FIELD_CATALOG,
    productLayout: PART_COMPATIBILITY_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'SKU',
    bandLabels: { status: 'Edge columns', subtitle: 'Under the title' },
  });
}
