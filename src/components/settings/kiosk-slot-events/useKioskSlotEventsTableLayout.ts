'use client';

/** Gate preamble (Fact-Forcing): */

import {
  KIOSKSLOTEVENTS_FIELD_CATALOG,
  KIOSKSLOTEVENTS_PRODUCT_LAYOUT,
  KIOSKSLOTEVENTS_TABLE_LAYOUT_ID,
} from '@/lib/tables/field-catalog/kiosk-slot-events';
import {
  useSlotTableLayout,
  type SlotTableLayout,
} from '@/components/tables/useSlotTableLayout';

export function useKioskSlotEventsTableLayout(): SlotTableLayout {
  return useSlotTableLayout({
    tableId: KIOSKSLOTEVENTS_TABLE_LAYOUT_ID,
    catalog: KIOSKSLOTEVENTS_FIELD_CATALOG,
    productLayout: KIOSKSLOTEVENTS_PRODUCT_LAYOUT,
    paintMorph: 'compound',
    identityFallbackLabel: 'Device',
    bandLabels: { status: 'Event columns', subtitle: 'Under the title' },
  });
}
