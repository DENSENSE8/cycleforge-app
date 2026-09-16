'use client';

/**
 * The unit-allocations slot-layout hook — this family's CONFIG on the shared
 * {@link useSlotTableLayout} engine.
 *
 * Compound morph only: a stored `sheet` layout would open a `subtitle:N` track
 * for the release reason, which the compound item cell paints inline —
 * `paintMorph` coerces, and the org write gate
 * (`slotMorphsFor('unit-allocations')`) refuses the foreign morph.
 *
 * Shared by both allocation mounts by construction: the per-SKU brief calls
 * this same hook, so a bind / hide / reorder an org makes on one surface lands
 * on the other. That is the point of one family for one entity.
 */

import {
  UNIT_ALLOCATIONS_FIELD_CATALOG,
  UNIT_ALLOCATIONS_PRODUCT_LAYOUT,
  UNIT_ALLOCATIONS_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/unit-allocations';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useUnitAllocationsTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: UNIT_ALLOCATIONS_TABLE_LAYOUT_ID,
    catalog: UNIT_ALLOCATIONS_FIELD_CATALOG,
    productLayout: UNIT_ALLOCATIONS_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'Order',
    bandLabels: { status: 'Allocation columns', subtitle: 'Under the title' },
  });
}
