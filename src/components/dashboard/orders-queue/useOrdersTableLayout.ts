'use client';

/** The To-ship slot-layout hook — the INDEX face's config on the shared {@link useSlotTableLayout} engine (which owns the cascade… */

import {
  ORDERS_INDEX_FIELD_CATALOG,
  ORDERS_INDEX_LAYOUT,
  ORDERS_INDEX_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/orders';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

/**
 * The desk's order list is the Shopify-style index (owner 2026-09-26): one
 * line per ORDER, its own `orders-index` document, sheet morph only. The
 * industrial line ledger is the floor face and reads no slot layout.
 */
export function useOrdersTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: ORDERS_INDEX_TABLE_LAYOUT_ID,
    catalog: ORDERS_INDEX_FIELD_CATALOG,
    productLayout: ORDERS_INDEX_LAYOUT,
    paintMorph: 'sheet',
    identityFallbackLabel: 'Order',
    bandLabels: { status: 'Columns' },
  });
}
