'use client';

/**
 * The per-SKU allocations slot-layout hook — the `unit-allocations` CATALOG on
 * this desk's own layout document.
 *
 * Identical in every respect to `useUnitAllocationsTableLayout` except the
 * `tableId` and the product defaults it starts from, both of which are the
 * point: the two feeds resolve different fact sets (this one filters
 * `state <> 'RELEASED'`, so the release facts are structurally NULL, and it is
 * the only one that selects `allocated_by`), so one prefs bucket would either
 * paint a column of dashes here or drop a fact the retired table painted. See
 * `field-catalog/sku-allocations-layout.ts` for the full ruling.
 *
 * Compound morph only: a stored `sheet` layout would open a `subtitle:N` track
 * for the release reason, which the compound item cell paints inline —
 * `paintMorph` coerces, and the org write gate (`slotMorphsFor`) refuses the
 * foreign morph.
 */

import {
  SKU_ALLOCATIONS_PRODUCT_LAYOUT,
  SKU_ALLOCATIONS_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/sku-allocations-layout';
// The CATALOG comes from the catalog module, never through the layout
// document: a re-export would be a second name for one SoT (the
// `catalog-orphan` fork).
import { UNIT_ALLOCATIONS_FIELD_CATALOG } from '@/lib/tables/field-catalog/unit-allocations';
import { useSlotTableLayout, type SlotTableLayout } from '@/components/tables/useSlotTableLayout';

export function useSkuAllocationsTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: SKU_ALLOCATIONS_TABLE_LAYOUT_ID,
    catalog: UNIT_ALLOCATIONS_FIELD_CATALOG,
    productLayout: SKU_ALLOCATIONS_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'Order',
    bandLabels: { status: 'Allocation columns', subtitle: 'Under the title' },
  });
}
