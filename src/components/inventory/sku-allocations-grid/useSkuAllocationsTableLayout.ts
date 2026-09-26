'use client';

/** The per-SKU allocations slot-layout hook — the `unit-allocations` CATALOG on this desk's own layout document. */

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
