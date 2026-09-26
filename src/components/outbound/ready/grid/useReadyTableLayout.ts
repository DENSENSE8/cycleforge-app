'use client';

/** The Ready slot-layout hook — the Ready CONFIG on the shared {@link useSlotTableLayout} engine (cascade resolve, staff-prefs RMW law, org… */

import {
  READY_FIELD_CATALOG,
  READY_PRODUCT_LAYOUT,
  READY_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/ready';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useReadyTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: READY_TABLE_LAYOUT_ID,
    catalog: READY_FIELD_CATALOG,
    productLayout: READY_PRODUCT_LAYOUT,
    paintMorph: 'sheet',
    identityFallbackLabel: 'Unit',
    // Sheet morph: subtitle bindings are real columns after Product, not an
    // under-title line — name the bands for what they open.
    bandLabels: { status: 'Status columns', subtitle: 'Detail columns' },
  });
}
