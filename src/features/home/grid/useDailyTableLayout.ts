'use client';

/**
 * The Daily slot-layout hook — the Daily CONFIG on the shared
 * {@link useSlotTableLayout} engine. The seventh family on the engine.
 *
 * Daily paints the COMPOUND morph only; a stored `sheet` layout would open
 * `subtitle:N` tracks nothing draws — `paintMorph` coerces, the org write gate
 * (`slotMorphsFor('daily')`) refuses.
 */

import {
  DAILY_FIELD_CATALOG,
  DAILY_PRODUCT_LAYOUT,
  DAILY_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/daily';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useDailyTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: DAILY_TABLE_LAYOUT_ID,
    catalog: DAILY_FIELD_CATALOG,
    productLayout: DAILY_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'Item',
  });
}
