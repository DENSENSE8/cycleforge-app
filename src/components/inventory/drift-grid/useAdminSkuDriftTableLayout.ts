'use client';

/**
 * The SKU-drift slot-layout hook — this family's CONFIG on the shared
 * {@link useSlotTableLayout} engine.
 *
 * Compound morph only: a stored `sheet` layout would open `subtitle:N` tracks
 * the compound item cell paints inline under the title — `paintMorph` coerces,
 * and the org write gate (`slotMorphsFor('admin-sku-drift')`) refuses the
 * foreign morph.
 */

import {
  ADMIN_SKU_DRIFT_FIELD_CATALOG,
  ADMIN_SKU_DRIFT_PRODUCT_LAYOUT,
  ADMIN_SKU_DRIFT_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/admin-sku-drift';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useAdminSkuDriftTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: ADMIN_SKU_DRIFT_TABLE_LAYOUT_ID,
    catalog: ADMIN_SKU_DRIFT_FIELD_CATALOG,
    productLayout: ADMIN_SKU_DRIFT_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'SKU',
    bandLabels: { status: 'Counter columns', subtitle: 'Under the delta' },
  });
}
