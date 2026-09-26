'use client';

/** The Tech-All slot-layout hook — the CONFIG on the shared {@link useSlotTableLayout} engine. */

import {
  TECH_ALL_FIELD_CATALOG,
  TECH_ALL_PRODUCT_LAYOUT,
  TECH_ALL_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/tech-all';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useTechAllTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: TECH_ALL_TABLE_LAYOUT_ID,
    catalog: TECH_ALL_FIELD_CATALOG,
    productLayout: TECH_ALL_PRODUCT_LAYOUT,
    paintMorph: 'sheet',
    identityFallbackLabel: 'Item',
    bandLabels: { status: 'Status columns', subtitle: 'Detail columns' },
  });
}
