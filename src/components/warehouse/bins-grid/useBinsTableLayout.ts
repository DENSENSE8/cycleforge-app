'use client';

/**
 * The Bins slot-layout hook — the Bins CONFIG on the shared
 * {@link useSlotTableLayout} engine. The twelfth family on the engine.
 *
 * Bins paints the SHEET morph only: a stored `compound` layout would promise a
 * two-row item cell nothing draws — `paintMorph` coerces, the org write gate
 * (`slotMorphsFor('bins')`) refuses.
 */

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
