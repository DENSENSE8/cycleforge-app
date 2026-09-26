'use client';

/** The dead-stock slot-layout hook — this family's CONFIG on the shared {@link useSlotTableLayout} engine. */

import {
  REPORT_DEAD_STOCK_FIELD_CATALOG,
  REPORT_DEAD_STOCK_PRODUCT_LAYOUT,
  REPORT_DEAD_STOCK_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/report-dead-stock';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useReportDeadStockTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: REPORT_DEAD_STOCK_TABLE_LAYOUT_ID,
    catalog: REPORT_DEAD_STOCK_FIELD_CATALOG,
    productLayout: REPORT_DEAD_STOCK_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'SKU',
    bandLabels: { status: 'Dead-stock columns', subtitle: 'Under the product' },
  });
}
