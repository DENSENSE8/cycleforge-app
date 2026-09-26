'use client';

/** The To-ship (orders) slot-layout hook — the orders CONFIG on the shared {@link useSlotTableLayout} engine (which owns the cascade… */

import {
  ORDERS_FIELD_CATALOG,
  ORDERS_PRODUCT_LAYOUT,
  ORDERS_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/orders';
import {
  useSlotTableLayout,
  type SlotTableFieldsMenu,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

const ORDERS_ORG_LAYOUT_QUERY_KEY = ['table-layouts', ORDERS_TABLE_LAYOUT_ID] as const;

/** Kept name — the orders mount's Fields-picker bag (structurally shared). */
type OrdersFieldsMenu = SlotTableFieldsMenu;

type OrdersTableLayout = SlotTableLayout;

export function useOrdersTableLayout(): OrdersTableLayout {
  return useSlotTableLayout({
    tableId: ORDERS_TABLE_LAYOUT_ID,
    catalog: ORDERS_FIELD_CATALOG,
    productLayout: ORDERS_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'Order',
  });
}
