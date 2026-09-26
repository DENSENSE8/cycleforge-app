'use client';

/** The order-import-staging slot-layout hook — the CONFIG on the shared {@link useSlotTableLayout} engine. */

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
