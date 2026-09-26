'use client';

/** The Units slot-layout hook — the Units CONFIG on the shared {@link useSlotTableLayout} engine. */

import {
  UNITS_FIELD_CATALOG,
  UNITS_PRODUCT_LAYOUT,
  UNITS_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/units';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useUnitsTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: UNITS_TABLE_LAYOUT_ID,
    catalog: UNITS_FIELD_CATALOG,
    productLayout: UNITS_PRODUCT_LAYOUT,
    paintMorph: 'sheet',
    identityFallbackLabel: 'Serial',
    // Sheet morph: subtitle bindings are real columns after Product, not an
    // under-title line — name the bands for what they open.
    bandLabels: { status: 'Status columns', subtitle: 'Detail columns' },
  });
}
