'use client';

import {
  DEAD_STOCK_FIELD_CATALOG,
  DEAD_STOCK_PRODUCT_LAYOUT,
  DEAD_STOCK_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/dead-stock';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useDeadStockTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: DEAD_STOCK_TABLE_LAYOUT_ID,
    catalog: DEAD_STOCK_FIELD_CATALOG,
    productLayout: DEAD_STOCK_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'SKU',
  });
}
