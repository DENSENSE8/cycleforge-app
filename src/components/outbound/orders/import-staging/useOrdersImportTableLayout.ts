'use client';

/**
 * The order-import-staging slot-layout hook — the CONFIG on the shared
 * {@link useSlotTableLayout} engine. The TWENTIETH family on the engine and the
 * last of wave 1.4.
 *
 * Staging keeps its own `tableId` on purpose (kill-list 07): hiding a staging
 * column must not densify live To-ship. That is a separate layout document,
 * which is precisely what a separate tableId buys.
 *
 * Sheet morph only — `paintMorph` coerces a stored `compound` document, and the
 * org write gate (`slotMorphsFor('orders-import')`) refuses one.
 */

import {
  ORDERS_IMPORT_FIELD_CATALOG,
  ORDERS_IMPORT_PRODUCT_LAYOUT,
  ORDERS_IMPORT_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/orders-import';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useOrdersImportTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: ORDERS_IMPORT_TABLE_LAYOUT_ID,
    catalog: ORDERS_IMPORT_FIELD_CATALOG,
    productLayout: ORDERS_IMPORT_PRODUCT_LAYOUT,
    paintMorph: 'sheet',
    identityFallbackLabel: 'Order number',
    bandLabels: { status: 'Status columns', subtitle: 'Detail columns' },
  });
}
