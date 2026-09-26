'use client';

/** The find plane's slot-layout hook — this family's CONFIG on the shared {@link useSlotTableLayout} engine. */

import {
  SEARCH_HITS_FIELD_CATALOG,
  SEARCH_HITS_PRODUCT_LAYOUT,
  SEARCH_HITS_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/search-hits';
import { useSlotTableLayout, type SlotTableLayout } from '@/components/tables/useSlotTableLayout';

export function useSearchHitsTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: SEARCH_HITS_TABLE_LAYOUT_ID,
    catalog: SEARCH_HITS_FIELD_CATALOG,
    productLayout: SEARCH_HITS_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'Id',
    bandLabels: { status: 'Result columns', subtitle: 'Under the description' },
  });
}
