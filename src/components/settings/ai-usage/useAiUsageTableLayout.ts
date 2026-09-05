'use client';

/**
 * The ai usage slot-layout hook — this family's CONFIG on the
 * shared {@link useSlotTableLayout} engine.
 *
 * Compound morph only: a stored `sheet` layout would open `subtitle:N` tracks
 * the compound item cell paints inline — `paintMorph` coerces, and the org write
 * gate (`slotMorphsFor('ai-usage')`) refuses the foreign morph.
 */

import {
  AIUSAGE_FIELD_CATALOG,
  AIUSAGE_PRODUCT_LAYOUT,
  AIUSAGE_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/ai-usage';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useAiUsageTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: AIUSAGE_TABLE_LAYOUT_ID,
    catalog: AIUSAGE_FIELD_CATALOG,
    productLayout: AIUSAGE_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'Use',
    bandLabels: { status: 'Usage columns', subtitle: 'Under the model' },
  });
}
