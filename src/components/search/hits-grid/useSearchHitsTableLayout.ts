'use client';

/**
 * The find plane's slot-layout hook — this family's CONFIG on the shared
 * {@link useSlotTableLayout} engine.
 *
 * Compound morph only: a stored `sheet` layout would open `subtitle:N` tracks
 * the compound item cell paints inline — `paintMorph` coerces, and the org
 * write gate (`slotMorphsFor('search-hits')`) refuses the foreign morph.
 *
 * Its OWN document, and deliberately not any desk's: the rows here are six
 * entity families flattened onto one wire shape, so binding `Channel` on the
 * find plane must not densify To-ship, and an org that hides `Matched` here
 * has said nothing about any queue.
 */

import {
  SEARCH_HITS_FIELD_CATALOG,
  SEARCH_HITS_PRODUCT_LAYOUT,
  SEARCH_HITS_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/search-hits';
import { useSlotTableLayout, type SlotTableLayout } from '@/components/tables/useSlotTableLayout';

export function useSearchHitsTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: SEARCH_HITS_TABLE_LAYOUT_ID,
    catalog: SEARCH_HITS_FIELD_CATALOG,
    productLayout: SEARCH_HITS_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'Id',
    bandLabels: { status: 'Result columns', subtitle: 'Under the description' },
  });
}
