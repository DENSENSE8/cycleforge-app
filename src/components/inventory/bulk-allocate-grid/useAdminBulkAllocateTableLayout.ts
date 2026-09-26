'use client';

/** The bulk-allocate slot-layout hook — this family's CONFIG on the shared {@link useSlotTableLayout} engine. */

import {
  ADMIN_BULK_ALLOCATE_FIELD_CATALOG,
  ADMIN_BULK_ALLOCATE_PRODUCT_LAYOUT,
  ADMIN_BULK_ALLOCATE_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/admin-bulk-allocate';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useAdminBulkAllocateTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: ADMIN_BULK_ALLOCATE_TABLE_LAYOUT_ID,
    catalog: ADMIN_BULK_ALLOCATE_FIELD_CATALOG,
    productLayout: ADMIN_BULK_ALLOCATE_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'Order id',
    bandLabels: { status: 'Candidate columns', subtitle: 'Under the SKU' },
  });
}
