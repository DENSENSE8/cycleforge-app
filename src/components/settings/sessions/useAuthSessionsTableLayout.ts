'use client';

/**
 * The auth-sessions slot-layout hook — this family's CONFIG on the shared
 * {@link useSlotTableLayout} engine.
 *
 * Compound morph only: a stored `sheet` layout would open `subtitle:N` tracks
 * the compound item cell paints inline — `paintMorph` coerces, and the org
 * write gate (`slotMorphsFor('auth-sessions')`) refuses the foreign morph.
 */

import {
  AUTHSESSIONS_FIELD_CATALOG,
  AUTHSESSIONS_PRODUCT_LAYOUT,
  AUTHSESSIONS_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/auth-sessions';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useAuthSessionsTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: AUTHSESSIONS_TABLE_LAYOUT_ID,
    catalog: AUTHSESSIONS_FIELD_CATALOG,
    productLayout: AUTHSESSIONS_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'Session',
    bandLabels: { status: 'Session columns', subtitle: 'Under the title' },
  });
}
