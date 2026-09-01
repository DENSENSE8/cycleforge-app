'use client';

/**
 * The Warranty slot-layout hook — the Warranty CONFIG on the shared
 * {@link useSlotTableLayout} engine. The thirteenth family on the engine.
 *
 * Warranty paints the SHEET morph only: a stored `compound` layout would
 * promise a two-row item cell nothing draws — `paintMorph` coerces, the org
 * write gate (`slotMorphsFor('warranty')`) refuses.
 */

import {
  WARRANTY_FIELD_CATALOG,
  WARRANTY_PRODUCT_LAYOUT,
  WARRANTY_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/warranty';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useWarrantyTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: WARRANTY_TABLE_LAYOUT_ID,
    catalog: WARRANTY_FIELD_CATALOG,
    productLayout: WARRANTY_PRODUCT_LAYOUT,
    paintMorph: 'sheet',
    identityFallbackLabel: 'Claim',
    bandLabels: { status: 'Status columns', subtitle: 'Detail columns' },
  });
}
