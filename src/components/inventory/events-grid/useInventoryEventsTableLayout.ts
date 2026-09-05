'use client';

/**
 * The Inventory-events slot-layout hook — the ledger's CONFIG on the shared
 * {@link useSlotTableLayout} engine.
 *
 * Compound morph only (2026-09-04): the ledger paints the SAME two-line WMS
 * row as To-ship. A stored `sheet` layout would open `subtitle:N` tracks the
 * compound item cell paints inline — `paintMorph` coerces, and the org write
 * gate (`slotMorphsFor('inventory-events')`) refuses the foreign morph.
 */

import {
  INVENTORY_EVENTS_FIELD_CATALOG,
  INVENTORY_EVENTS_PRODUCT_LAYOUT,
  INVENTORY_EVENTS_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/inventory-events';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useInventoryEventsTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: INVENTORY_EVENTS_TABLE_LAYOUT_ID,
    catalog: INVENTORY_EVENTS_FIELD_CATALOG,
    productLayout: INVENTORY_EVENTS_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'SKU',
    bandLabels: { status: 'Event columns', subtitle: 'Under the title' },
  });
}
