'use client';

/** The staff-day slot-layout hook — this family's CONFIG on the shared {@link useSlotTableLayout} engine. */

import {
  REPORT_STAFF_DAY_FIELD_CATALOG,
  REPORT_STAFF_DAY_PRODUCT_LAYOUT,
  REPORT_STAFF_DAY_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/report-staff-day';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useReportStaffDayTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: REPORT_STAFF_DAY_TABLE_LAYOUT_ID,
    catalog: REPORT_STAFF_DAY_FIELD_CATALOG,
    productLayout: REPORT_STAFF_DAY_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'Staff',
    bandLabels: { status: 'Shift facts', subtitle: 'Under the task' },
  });
}
