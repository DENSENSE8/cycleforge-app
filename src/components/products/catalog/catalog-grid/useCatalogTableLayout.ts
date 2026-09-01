'use client';

/**
 * The Catalog slot-layout hook — the Products-catalog CONFIG on the shared
 * {@link useSlotTableLayout} engine. The fourteenth family on the engine.
 *
 * Catalog paints the SHEET morph only: a stored `compound` layout would promise
 * a two-row item cell nothing draws — `paintMorph` coerces, the org write gate
 * (`slotMorphsFor('catalog')`) refuses.
 */

import {
  CATALOG_FIELD_CATALOG,
  CATALOG_PRODUCT_LAYOUT,
  CATALOG_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/catalog';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useCatalogTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: CATALOG_TABLE_LAYOUT_ID,
    catalog: CATALOG_FIELD_CATALOG,
    productLayout: CATALOG_PRODUCT_LAYOUT,
    paintMorph: 'sheet',
    identityFallbackLabel: 'SKU',
    bandLabels: { status: 'Status columns', subtitle: 'Detail columns' },
  });
}
