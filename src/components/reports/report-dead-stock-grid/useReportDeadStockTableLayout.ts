'use client';

/**
 * The dead-stock slot-layout hook — this family's CONFIG on the shared
 * {@link useSlotTableLayout} engine.
 *
 * Compound morph only: a stored `sheet` layout would open `subtitle:N` tracks
 * the compound item cell has nothing to paint into — `paintMorph` coerces, and
 * the org write gate (`slotMorphsFor('report-dead-stock')`) refuses the
 * foreign morph.
 *
 * The Fields menu keys off `tableId`, so `/reports` gets the RIGHT picker per
 * tab for free: each of the three reports mounts its own family, so the popover
 * that opens over Dead stock lists dormancy facts and the one over Bin
 * utilization lists bin facts, with no per-tab branch anywhere.
 */

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
