'use client';

/**
 * The Tech-All slot-layout hook — the CONFIG on the shared
 * {@link useSlotTableLayout} engine. The fifteenth family on the engine.
 *
 * One document across the Testing / Shipping / Unbox All tabs, deliberately:
 * they are the same triage strip read at three scopes, and a per-scope layout
 * would be the lane-conditional column model the engine exists to prevent.
 *
 * Sheet morph only — `paintMorph` coerces a stored `compound` document, and the
 * org write gate (`slotMorphsFor('tech-all')`) refuses one.
 */

import {
  TECH_ALL_FIELD_CATALOG,
  TECH_ALL_PRODUCT_LAYOUT,
  TECH_ALL_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/tech-all';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useTechAllTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: TECH_ALL_TABLE_LAYOUT_ID,
    catalog: TECH_ALL_FIELD_CATALOG,
    productLayout: TECH_ALL_PRODUCT_LAYOUT,
    paintMorph: 'sheet',
    identityFallbackLabel: 'Item',
    bandLabels: { status: 'Status columns', subtitle: 'Detail columns' },
  });
}
