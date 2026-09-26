'use client';

/** The packer-day slot-layout hook — this family's CONFIG on the shared {@link useSlotTableLayout} engine. */

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
