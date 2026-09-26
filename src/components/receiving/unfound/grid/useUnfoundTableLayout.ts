'use client';

/** The Unfound slot-layout hook — the CONFIG on the shared {@link useSlotTableLayout} engine. */

import {
  UNFOUND_FIELD_CATALOG,
  UNFOUND_PRODUCT_LAYOUT,
  UNFOUND_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/unfound';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useUnfoundTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: UNFOUND_TABLE_LAYOUT_ID,
    catalog: UNFOUND_FIELD_CATALOG,
    productLayout: UNFOUND_PRODUCT_LAYOUT,
    paintMorph: 'sheet',
    identityFallbackLabel: 'Item',
    bandLabels: { status: 'Status columns', subtitle: 'Detail columns' },
  });
}
