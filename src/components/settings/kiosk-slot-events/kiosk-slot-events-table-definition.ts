/** Gate preamble: */

import type { KioskSlotEventTableRow } from '@/lib/kiosk/kiosk-slot-event-row';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import {
  KIOSKSLOTEVENTS_COMPOUND_COLUMNS,
  type KioskSlotEventsGridColumn,
} from './kiosk-slot-events-grid-layout';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  KIOSKSLOTEVENTS_GRID_CAPABILITIES,
  makeKioskSlotEventsGridDescriptor,
} from './kiosk-slot-events-grid-descriptor';

export const KIOSKSLOTEVENTS_TABLE_DEFINITION = parseTableDefinition({
  id: 'settings.kiosk-slot-events',
  tableId: 'kiosk-slot-events',
  entityFamily: 'kiosk-slot-events',
  cellMapKey: 'kiosk-slot-events',
  ariaLabel: 'Kiosk slot history',
  testId: 'kiosk-slot-events-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: KIOSKSLOTEVENTS_GRID_CAPABILITIES,
  columns: KIOSKSLOTEVENTS_COMPOUND_COLUMNS,
});

export const KIOSKSLOTEVENTS_TABLE_BINDING: TableSurfaceBinding<
  KioskSlotEventTableRow,
  KioskSlotEventsGridColumn
> = {
  definition: KIOSKSLOTEVENTS_TABLE_DEFINITION,
  columns: KIOSKSLOTEVENTS_COMPOUND_COLUMNS,
  makeDescriptor: makeKioskSlotEventsGridDescriptor,
  recordPlane: {
    kind: 'none',
    reason:
      'A slot transition is a fact that already happened — filter/export only. Credential Revoke stays on the kiosk-devices fleet peer.',
  },
};
