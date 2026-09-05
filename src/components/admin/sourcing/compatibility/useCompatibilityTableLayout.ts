'use client';

/**
 * The compatibility rules slot-layout hook — this family's CONFIG on the
 * shared {@link useSlotTableLayout} engine.
 *
 * Compound morph only: a stored `sheet` layout would open `subtitle:N` tracks
 * the compound item cell paints inline — `paintMorph` coerces, and the org write
 * gate (`slotMorphsFor('compatibility')`) refuses the foreign morph.
 */

import {
  COMPATIBILITY_FIELD_CATALOG,
  COMPATIBILITY_PRODUCT_LAYOUT,
  COMPATIBILITY_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/compatibility';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useCompatibilityTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: COMPATIBILITY_TABLE_LAYOUT_ID,
    catalog: COMPATIBILITY_FIELD_CATALOG,
    productLayout: COMPATIBILITY_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'Rule',
    bandLabels: { status: 'Rule columns', subtitle: 'Under the part' },
  });
}
