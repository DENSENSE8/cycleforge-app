'use client';

/** The import-exception slot-layout hook — the Review · Missing item number CONFIG on the shared {@link useSlotTableLayout} engine. */

import {
  IMPORT_EXCEPTION_FIELD_CATALOG,
  IMPORT_EXCEPTION_PRODUCT_LAYOUT,
  IMPORT_EXCEPTION_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/import-exception';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useImportExceptionTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: IMPORT_EXCEPTION_TABLE_LAYOUT_ID,
    catalog: IMPORT_EXCEPTION_FIELD_CATALOG,
    productLayout: IMPORT_EXCEPTION_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'Order',
  });
}
