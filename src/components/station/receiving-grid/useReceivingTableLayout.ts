'use client';

/**
 * The receiving slot-layout hook — the receiving CONFIG on the shared
 * {@link useSlotTableLayout} engine (cascade resolve, staff-prefs RMW law, org
 * capture, Fields-picker data; see its docblock). The fifth family on the
 * engine and the first COMPOUND port after Orders — proof that the compound
 * morph adopts by config too, not by a second hook.
 *
 * Receiving paints the COMPOUND morph only, on every rail: Unbox, History and
 * Testing are the same table read at different moments. A stored `sheet`
 * layout would open `subtitle:N` tracks nothing draws — `paintMorph` coerces,
 * the org write gate (`slotMorphsFor('receiving')`) refuses.
 */

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
