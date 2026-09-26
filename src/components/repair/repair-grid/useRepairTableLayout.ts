'use client';

/** The Repair slot-layout hook — the CONFIG on the shared {@link useSlotTableLayout} engine. */

import {
  REPAIR_FIELD_CATALOG,
  REPAIR_PRODUCT_LAYOUT,
  REPAIR_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/repair';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useRepairTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: REPAIR_TABLE_LAYOUT_ID,
    catalog: REPAIR_FIELD_CATALOG,
    productLayout: REPAIR_PRODUCT_LAYOUT,
    paintMorph: 'sheet',
    identityFallbackLabel: 'Service',
    bandLabels: { status: 'Status columns', subtitle: 'Detail columns' },
  });
}
