'use client';

/**
 * The My-Day slot-layout hook — the CONFIG on the shared
 * {@link useSlotTableLayout} engine. The eighteenth family on the engine.
 *
 * Sheet morph only — `paintMorph` coerces a stored `compound` document, and the
 * org write gate (`slotMorphsFor('my-day')`) refuses one.
 */

import {
  MY_DAY_FIELD_CATALOG,
  MY_DAY_PRODUCT_LAYOUT,
  MY_DAY_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/my-day';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useMyDayTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: MY_DAY_TABLE_LAYOUT_ID,
    catalog: MY_DAY_FIELD_CATALOG,
    productLayout: MY_DAY_PRODUCT_LAYOUT,
    paintMorph: 'sheet',
    identityFallbackLabel: 'Task',
    bandLabels: { status: 'Status columns', subtitle: 'Detail columns' },
  });
}
