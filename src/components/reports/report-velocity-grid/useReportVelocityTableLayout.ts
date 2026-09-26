'use client';

/** The SKU-velocity slot-layout hook — this family's CONFIG on the shared {@link useSlotTableLayout} engine. */

import {
  REPORT_VELOCITY_FIELD_CATALOG,
  REPORT_VELOCITY_PRODUCT_LAYOUT,
  REPORT_VELOCITY_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/report-velocity';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useReportVelocityTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: REPORT_VELOCITY_TABLE_LAYOUT_ID,
    catalog: REPORT_VELOCITY_FIELD_CATALOG,
    productLayout: REPORT_VELOCITY_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'SKU',
    bandLabels: { status: 'Velocity columns', subtitle: 'Under the product' },
  });
}
