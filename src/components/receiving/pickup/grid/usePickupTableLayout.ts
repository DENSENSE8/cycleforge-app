'use client';

/** The Local-pickup slot-layout hook — the pickup CONFIG on the shared {@link useSlotTableLayout} engine (cascade resolve, staff-prefs RMW… */

import {
  PICKUP_FIELD_CATALOG,
  PICKUP_PRODUCT_LAYOUT,
  PICKUP_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/pickup';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function usePickupTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: PICKUP_TABLE_LAYOUT_ID,
    catalog: PICKUP_FIELD_CATALOG,
    productLayout: PICKUP_PRODUCT_LAYOUT,
    paintMorph: 'sheet',
    identityFallbackLabel: 'Order',
    // Sheet morph: subtitle bindings are real columns after Order, not an
    // under-title line — name the bands for what they open.
    bandLabels: { status: 'Status columns', subtitle: 'Detail columns' },
  });
}
