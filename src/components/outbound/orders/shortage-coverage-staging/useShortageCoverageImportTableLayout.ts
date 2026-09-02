'use client';

/**
 * The shortage-coverage-import slot-layout hook — own tableId so hiding a
 * staging column cannot densify live Shortage. Sheet morph only.
 */

import {
  SHORTAGE_COVERAGE_IMPORT_FIELD_CATALOG,
  SHORTAGE_COVERAGE_IMPORT_PRODUCT_LAYOUT,
  SHORTAGE_COVERAGE_IMPORT_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/shortage-coverage-import';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useShortageCoverageImportTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: SHORTAGE_COVERAGE_IMPORT_TABLE_LAYOUT_ID,
    catalog: SHORTAGE_COVERAGE_IMPORT_FIELD_CATALOG,
    productLayout: SHORTAGE_COVERAGE_IMPORT_PRODUCT_LAYOUT,
    paintMorph: 'sheet',
    identityFallbackLabel: 'Order number',
    bandLabels: { status: 'Status columns', subtitle: 'Detail columns' },
  });
}
