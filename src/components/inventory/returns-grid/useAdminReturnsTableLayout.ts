'use client';

/**
 * The Returns dock slot-layout hook — this family's CONFIG on the shared
 * {@link useSlotTableLayout} engine.
 *
 * Compound morph only: a stored `sheet` layout would open `subtitle:N` tracks
 * the compound item cell paints inline (the reason · order line), and the org
 * write gate (`slotMorphsFor('admin-returns')`) refuses the foreign morph.
 */

import {
  ADMIN_RETURNS_FIELD_CATALOG,
  ADMIN_RETURNS_PRODUCT_LAYOUT,
  ADMIN_RETURNS_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/admin-returns';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useAdminReturnsTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: ADMIN_RETURNS_TABLE_LAYOUT_ID,
    catalog: ADMIN_RETURNS_FIELD_CATALOG,
    productLayout: ADMIN_RETURNS_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'Unit',
    bandLabels: { status: 'Return columns', subtitle: 'Under the title' },
  });
}
