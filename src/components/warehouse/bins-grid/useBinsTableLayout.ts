'use client';

/** The Bins slot-layout hook — the Bins CONFIG on the shared {@link useSlotTableLayout} engine. */

import {
  BINS_FIELD_CATALOG,
  BINS_PRODUCT_LAYOUT,
  BINS_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/bins';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useBinsTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: BINS_TABLE_LAYOUT_ID,
    catalog: BINS_FIELD_CATALOG,
    productLayout: BINS_PRODUCT_LAYOUT,
    paintMorph: 'sheet',
    identityFallbackLabel: 'Barcode',
    bandLabels: { status: 'Status columns', subtitle: 'Detail columns' },
  });
}
