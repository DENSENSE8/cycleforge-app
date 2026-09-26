'use client';

/** The stock-ledger slot-layout hook — this family's CONFIG on the shared {@link useSlotTableLayout} engine. */

import {
  SKU_LEDGER_FIELD_CATALOG,
  SKU_LEDGER_PRODUCT_LAYOUT,
  SKU_LEDGER_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/sku-ledger';
import { useSlotTableLayout, type SlotTableLayout } from '@/components/tables/useSlotTableLayout';

export function useSkuLedgerTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: SKU_LEDGER_TABLE_LAYOUT_ID,
    catalog: SKU_LEDGER_FIELD_CATALOG,
    productLayout: SKU_LEDGER_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'Order',
    bandLabels: { status: 'Ledger columns', subtitle: 'Under the reason' },
  });
}
