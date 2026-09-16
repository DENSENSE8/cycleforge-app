'use client';

/**
 * The packer-day slot-layout hook — this family's CONFIG on the shared
 * {@link useSlotTableLayout} engine.
 *
 * Compound morph only, like its siblings: a stored `sheet` layout would open
 * `subtitle:N` tracks the compound item cell has nothing to paint into.
 *
 * The Fields menu keys off `tableId`, so the Packer-day tab gets its own
 * picker — tier and order-ref facts, not bin facts — with no per-tab branch in
 * the page.
 */

import {
  REPORT_PACKER_DAY_FIELD_CATALOG,
  REPORT_PACKER_DAY_PRODUCT_LAYOUT,
  REPORT_PACKER_DAY_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/report-packer-day';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useReportPackerDayTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: REPORT_PACKER_DAY_TABLE_LAYOUT_ID,
    catalog: REPORT_PACKER_DAY_FIELD_CATALOG,
    productLayout: REPORT_PACKER_DAY_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'Packer',
    bandLabels: { status: 'Pack facts', subtitle: 'Under the product' },
  });
}
