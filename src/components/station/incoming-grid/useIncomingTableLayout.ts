'use client';

/**
 * The Incoming slot-layout hook — the Incoming CONFIG on the shared
 * {@link useSlotTableLayout} engine. The sixth family on the engine, and the
 * pair that proves the kill list's "two table ids, one cell map": Incoming and
 * Receiving carry the same row type through the same compound cells, and still
 * keep independent layout documents — because what the two tables MEAN by
 * "status" is different (carrier vs warehouse), not because they draw
 * differently.
 *
 * Incoming paints the COMPOUND morph only; a stored `sheet` layout would open
 * `subtitle:N` tracks nothing draws — `paintMorph` coerces, the org write gate
 * (`slotMorphsFor('incoming')`) refuses.
 */

import {
  INCOMING_FIELD_CATALOG,
  INCOMING_PRODUCT_LAYOUT,
  INCOMING_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/incoming';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useIncomingTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: INCOMING_TABLE_LAYOUT_ID,
    catalog: INCOMING_FIELD_CATALOG,
    productLayout: INCOMING_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'Order',
  });
}
