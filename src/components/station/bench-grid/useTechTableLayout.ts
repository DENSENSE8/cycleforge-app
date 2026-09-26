'use client';

/** The tech-bench slot-layout hook — the tech CONFIG on the shared {@link useSlotTableLayout} engine (cascade resolve, staff-prefs RMW law,… */

import {
  TECH_FIELD_CATALOG,
  TECH_PRODUCT_LAYOUT,
  TECH_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/tech';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useTechTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: TECH_TABLE_LAYOUT_ID,
    catalog: TECH_FIELD_CATALOG,
    productLayout: TECH_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    // The bench row IS an order line — identity reads "Order", same word the
    // Unshipped board and Receiving use.
    identityFallbackLabel: 'Order',
    // Compound morph: the defaults already read right ("Status columns" /
    // "Under the title"), so no override.
  });
}
