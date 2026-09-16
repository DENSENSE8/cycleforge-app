'use client';

/**
 * The packer-bench slot-layout hook — the packer CONFIG on the shared
 * {@link useSlotTableLayout} engine. Sibling of {@link useTechTableLayout},
 * never a merge with it: two benches answer two questions ("what did I test"
 * vs "what did I pack"), so each keeps its own catalog and its own prefs
 * bucket while sharing this engine and nothing else.
 *
 * Compound morph only — see `useTechTableLayout` for why a stored `sheet`
 * layout would open tracks nothing draws.
 */

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
