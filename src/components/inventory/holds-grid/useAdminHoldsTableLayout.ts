'use client';

/**
 * The Holds desk slot-layout hook — this family's CONFIG on the shared
 * {@link useSlotTableLayout} engine.
 *
 * Compound morph only: a stored `sheet` layout would open a `subtitle:N` track
 * the compound item cell paints inline (the hold reason under the serial) —
 * `paintMorph` coerces, and the org write gate (`slotMorphsFor('admin-holds')`)
 * refuses the foreign morph.
 */

import {
  ADMINHOLDS_FIELD_CATALOG,
  ADMINHOLDS_PRODUCT_LAYOUT,
  ADMINHOLDS_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/admin-holds';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useAdminHoldsTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: ADMINHOLDS_TABLE_LAYOUT_ID,
    catalog: ADMINHOLDS_FIELD_CATALOG,
    productLayout: ADMINHOLDS_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'Unit',
    bandLabels: { status: 'Hold columns', subtitle: 'Under the serial' },
  });
}
