'use client';

/**
 * The Tasks slot-layout hook — the Tasks CONFIG on the shared
 * {@link useSlotTableLayout} engine. The eighth family on the engine.
 *
 * Tasks paints the COMPOUND morph only; a stored `sheet` layout would open
 * `subtitle:N` tracks nothing draws — `paintMorph` coerces, the org write gate
 * (`slotMorphsFor('tasks')`) refuses.
 */

import {
  TASKS_FIELD_CATALOG,
  TASKS_PRODUCT_LAYOUT,
  TASKS_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/tasks';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useTasksTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: TASKS_TABLE_LAYOUT_ID,
    catalog: TASKS_FIELD_CATALOG,
    productLayout: TASKS_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'Task',
  });
}
