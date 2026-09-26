'use client';

/** The receiving slot-layout hook — the receiving CONFIG on the shared {@link useSlotTableLayout} engine (cascade resolve, staff-prefs RMW… */

import {
  RECEIVING_FIELD_CATALOG,
  RECEIVING_PRODUCT_LAYOUT,
  RECEIVING_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/receiving';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useReceivingTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: RECEIVING_TABLE_LAYOUT_ID,
    catalog: RECEIVING_FIELD_CATALOG,
    productLayout: RECEIVING_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'Order',
    // Compound morph: the defaults already read right ("Status columns" /
    // "Under the title"), so no override.
  });
}
