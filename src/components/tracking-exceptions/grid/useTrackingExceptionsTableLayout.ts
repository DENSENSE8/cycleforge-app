'use client';

/** The tracking-exceptions slot-layout hook — the CONFIG on the shared {@link useSlotTableLayout} engine. */

import {
  TRACKING_EXCEPTIONS_FIELD_CATALOG,
  TRACKING_EXCEPTIONS_PRODUCT_LAYOUT,
  TRACKING_EXCEPTIONS_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/tracking-exceptions';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useTrackingExceptionsTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: TRACKING_EXCEPTIONS_TABLE_LAYOUT_ID,
    catalog: TRACKING_EXCEPTIONS_FIELD_CATALOG,
    productLayout: TRACKING_EXCEPTIONS_PRODUCT_LAYOUT,
    paintMorph: 'sheet',
    identityFallbackLabel: 'Tracking',
    bandLabels: { status: 'Status columns', subtitle: 'Detail columns' },
  });
}
