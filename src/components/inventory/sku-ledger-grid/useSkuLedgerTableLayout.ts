'use client';

/**
 * The stock-ledger slot-layout hook — this family's CONFIG on the shared
 * {@link useSlotTableLayout} engine.
 *
 * Compound morph only: a stored `sheet` layout would open `subtitle:N` tracks
 * the compound item cell paints inline — `paintMorph` coerces, and the org
 * write gate (`slotMorphsFor('sku-ledger')`) refuses the foreign morph.
 *
 * Its OWN document, never `inventory-events`': the Ledger activity feed is a
 * STATUS history of units ("what happened to this thing"), while this is the
 * authoritative signed-QUANTITY store ("how the number changed"). Two stores,
 * two vocabularies, one engine — the same ruling that keeps `admin-returns` a
 * sibling of `inventory-events` rather than a view of it.
 */

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
