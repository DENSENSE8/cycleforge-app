'use client';

/**
 * Gate preamble (Fact-Forcing):
 * Importers: useKioskSlotEventsSpreadsheet; SLOT_TABLE_ENGINE_LAYOUT_HOOKS entry.
 * Affected API: none. Schemas: SlotTableLayout for tableId kiosk-slot-events.
 * User instruction: Continue to the next phase (register PRODUCT_TABLES peer).
 */

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
