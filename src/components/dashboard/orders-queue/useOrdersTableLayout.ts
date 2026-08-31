'use client';

/**
 * The To-ship (orders) slot-layout hook — the orders CONFIG on the shared
 * {@link useSlotTableLayout} engine (which owns the cascade resolve, the
 * whole-map staff-prefs RMW law, the org capture, and the Fields-picker data;
 * see its docblock for the write semantics). Orders proved the shape; the
 * engine moved to `@/components/tables/useSlotTableLayout` when pickup became
 * the second family (kill-list 07 §4) so the RMW law exists once.
 *
 * To-ship paints the COMPOUND morph only this ship (sheet paint on orders is
 * Phase 4): a stored `sheet` morph must not open subtitle tracks nothing
 * renders — `paintMorph` coerces, the org write gate refuses.
 */

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

export const ORDERS_ORG_LAYOUT_QUERY_KEY = ['table-layouts', ORDERS_TABLE_LAYOUT_ID] as const;

/** Kept name — the orders mount's Fields-picker bag (structurally shared). */
export type OrdersFieldsMenu = SlotTableFieldsMenu;

export type OrdersTableLayout = SlotTableLayout;

export function useOrdersTableLayout(): OrdersTableLayout {
  return useSlotTableLayout({
    tableId: ORDERS_TABLE_LAYOUT_ID,
    catalog: ORDERS_FIELD_CATALOG,
    productLayout: ORDERS_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'Order',
  });
}
