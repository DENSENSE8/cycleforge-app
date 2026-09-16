'use client';

/**
 * The cycle-count-lines slot-layout hook — this family's CONFIG on the shared
 * {@link useSlotTableLayout} engine (cascade resolve, staff-prefs RMW law, org
 * capture, Fields-picker data; see its docblock). Config, never a fork.
 *
 * Compound morph only: a stored `sheet` layout would open a `subtitle:1` track
 * for the variance tolerance, which the compound item cell paints inline —
 * `paintMorph` coerces, and the org write gate
 * (`slotMorphsFor('cycle-count-lines')`) refuses the foreign morph outright.
 */

import {
  CYCLECOUNTLINES_FIELD_CATALOG,
  CYCLECOUNTLINES_PRODUCT_LAYOUT,
  CYCLECOUNTLINES_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/cycle-count-lines';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useCycleCountLinesTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: CYCLECOUNTLINES_TABLE_LAYOUT_ID,
    catalog: CYCLECOUNTLINES_FIELD_CATALOG,
    productLayout: CYCLECOUNTLINES_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'Bin',
    bandLabels: { status: 'Line columns', subtitle: 'Under the SKU' },
  });
}
