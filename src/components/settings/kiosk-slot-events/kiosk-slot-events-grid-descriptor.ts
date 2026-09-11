/**
 * Gate preamble (Fact-Forcing):
 * Importers: kiosk-slot-events-table-definition (makeDescriptor / capabilities).
 * Affected API: none. Data schemas: GridSurfaceCapabilities + KioskSlotEventTableRow.
 * User instruction: Continue to the next phase (kiosk-slot-events history peer).
 */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { KioskSlotEventTableRow } from '@/lib/kiosk/kiosk-slot-event-row';
import {
  defaultDirForKioskSlotEventsColumn,
  isKioskSlotEventsColumnSortable,
  type KioskSlotEventsGridColumn,
} from './kiosk-slot-events-grid-layout';

export const KIOSKSLOTEVENTS_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: false,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

export function makeKioskSlotEventsGridDescriptor(
  columns: readonly KioskSlotEventsGridColumn[],
): GridSurfaceDescriptor<KioskSlotEventTableRow, KioskSlotEventsGridColumn> {
  return makeGridSurfaceDescriptor<KioskSlotEventTableRow, KioskSlotEventsGridColumn>(
    'settings.kiosk-slot-events',
    columns,
    {
      isSortable: (key) => isKioskSlotEventsColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForKioskSlotEventsColumn(columns, key) === 'desc',
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    KIOSKSLOTEVENTS_GRID_CAPABILITIES,
  );
}
