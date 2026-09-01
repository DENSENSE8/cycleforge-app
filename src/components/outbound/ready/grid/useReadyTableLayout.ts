'use client';

/**
 * The Ready slot-layout hook — the Ready CONFIG on the shared
 * {@link useSlotTableLayout} engine (cascade resolve, staff-prefs RMW law, org
 * capture, Fields-picker data; see its docblock). The FOURTH family on the
 * engine and the first Wave-3 port — more proof that adoption is a config
 * object, not a hook fork.
 *
 * Ready paints the SHEET morph only: a stored `compound` layout would promise
 * a two-row item cell nothing draws — `paintMorph` coerces, the org write gate
 * (`slotMorphsFor('ready')`) refuses.
 */

import {
  READY_FIELD_CATALOG,
  READY_PRODUCT_LAYOUT,
  READY_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/ready';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useReadyTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: READY_TABLE_LAYOUT_ID,
    catalog: READY_FIELD_CATALOG,
    productLayout: READY_PRODUCT_LAYOUT,
    paintMorph: 'sheet',
    identityFallbackLabel: 'Unit',
    // Sheet morph: subtitle bindings are real columns after Product, not an
    // under-title line — name the bands for what they open.
    bandLabels: { status: 'Status columns', subtitle: 'Detail columns' },
  });
}
