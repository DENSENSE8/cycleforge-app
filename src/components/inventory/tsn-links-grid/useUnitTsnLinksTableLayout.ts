'use client';

/**
 * The unit-TSN-links slot-layout hook — this family's CONFIG on the shared
 * {@link useSlotTableLayout} engine.
 *
 * Compound morph only: a stored `sheet` layout would open `subtitle:N` tracks
 * the compound item cell paints inline — `paintMorph` coerces, and the org
 * write gate (`slotMorphsFor('unit-tsn-links')`) refuses the foreign morph.
 */

import {
  UNIT_TSN_LINKS_FIELD_CATALOG,
  UNIT_TSN_LINKS_PRODUCT_LAYOUT,
  UNIT_TSN_LINKS_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/unit-tsn-links';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useUnitTsnLinksTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: UNIT_TSN_LINKS_TABLE_LAYOUT_ID,
    catalog: UNIT_TSN_LINKS_FIELD_CATALOG,
    productLayout: UNIT_TSN_LINKS_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'TSN id',
    bandLabels: { status: 'TSN columns', subtitle: 'Under the title' },
  });
}
