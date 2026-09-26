'use client';

/** The packer-bench slot-layout hook — the packer CONFIG on the shared {@link useSlotTableLayout} engine. */

import {
  PACKER_FIELD_CATALOG,
  PACKER_PRODUCT_LAYOUT,
  PACKER_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/packer';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function usePackerTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: PACKER_TABLE_LAYOUT_ID,
    catalog: PACKER_FIELD_CATALOG,
    productLayout: PACKER_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'Order',
  });
}
