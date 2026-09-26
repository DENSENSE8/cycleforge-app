'use client';

/** The staff-directory slot-layout hook — this family's CONFIG on the shared {@link useSlotTableLayout} engine. */

import {
  STAFF_DIRECTORY_FIELD_CATALOG,
  STAFF_DIRECTORY_PRODUCT_LAYOUT,
  STAFF_DIRECTORY_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/staff-directory';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useStaffDirectoryTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: STAFF_DIRECTORY_TABLE_LAYOUT_ID,
    catalog: STAFF_DIRECTORY_FIELD_CATALOG,
    productLayout: STAFF_DIRECTORY_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'Staff #',
    bandLabels: { status: 'Team columns', subtitle: 'Under the name' },
  });
}
