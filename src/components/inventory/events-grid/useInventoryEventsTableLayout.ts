'use client';

/** The Inventory-events slot-layout hook — the ledger's CONFIG on the shared {@link useSlotTableLayout} engine. */

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
