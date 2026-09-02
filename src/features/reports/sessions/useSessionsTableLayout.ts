'use client';

import {
  SESSIONS_FIELD_CATALOG,
  SESSIONS_PRODUCT_LAYOUT,
  SESSIONS_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/sessions';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useSessionsTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: SESSIONS_TABLE_LAYOUT_ID,
    catalog: SESSIONS_FIELD_CATALOG,
    productLayout: SESSIONS_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'Staff',
  });
}
