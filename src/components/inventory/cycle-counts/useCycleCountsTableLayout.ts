'use client';

/**
 * The cycle-counts slot-layout hook — this family's CONFIG on the shared
 * {@link useSlotTableLayout} engine (cascade resolve, staff-prefs RMW law, org
 * capture, Fields-picker data; see its docblock). Config, never a fork.
 *
 * Compound morph only: a stored `sheet` layout would open a `subtitle:1` track
 * for the variance tolerance, which the compound item cell paints inline —
 * `paintMorph` coerces, and the org write gate (`slotMorphsFor('cycle-counts')`)
 * refuses the foreign morph outright.
 */

import {
  CYCLECOUNTS_FIELD_CATALOG,
  CYCLECOUNTS_PRODUCT_LAYOUT,
  CYCLECOUNTS_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/cycle-counts';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useCycleCountsTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: CYCLECOUNTS_TABLE_LAYOUT_ID,
    catalog: CYCLECOUNTS_FIELD_CATALOG,
    productLayout: CYCLECOUNTS_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'Campaign',
    bandLabels: { status: 'Campaign columns', subtitle: 'Under the name' },
  });
}
