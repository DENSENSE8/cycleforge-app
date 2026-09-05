'use client';

import {
  SKU_VELOCITY_FIELD_CATALOG,
  SKU_VELOCITY_PRODUCT_LAYOUT,
  SKU_VELOCITY_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/sku-velocity';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useSkuVelocityTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: SKU_VELOCITY_TABLE_LAYOUT_ID,
    catalog: SKU_VELOCITY_FIELD_CATALOG,
    productLayout: SKU_VELOCITY_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'SKU',
  });
}
