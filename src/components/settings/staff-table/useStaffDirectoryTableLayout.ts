'use client';

/**
 * The team slot-layout hook — this family's CONFIG on the
 * shared {@link useSlotTableLayout} engine.
 *
 * Compound morph only: a stored `sheet` layout would open `subtitle:N` tracks
 * the compound item cell paints inline — `paintMorph` coerces, and the org write
 * gate (`slotMorphsFor('staff-directory')`) refuses the foreign morph.
 */

import {
  STAFFDIRECTORY_FIELD_CATALOG,
  STAFFDIRECTORY_PRODUCT_LAYOUT,
  STAFFDIRECTORY_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/staff-directory';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useStaffDirectoryTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: STAFFDIRECTORY_TABLE_LAYOUT_ID,
    catalog: STAFFDIRECTORY_FIELD_CATALOG,
    productLayout: STAFFDIRECTORY_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'Staff',
    bandLabels: { status: 'Staff columns', subtitle: 'Under the name' },
  });
}
