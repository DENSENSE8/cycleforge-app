/**
 * `settings.kiosk-devices` — the kiosk devices table definition.
 *
 * Re-declares nothing: columns + capabilities are the family SoT by reference.
 */

import type { KioskDeviceTableRow } from '@/lib/kiosk/kiosk-device-row';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { KIOSKDEVICES_COMPOUND_COLUMNS, type KioskDevicesGridColumn } from './kiosk-devices-grid-layout';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  KIOSKDEVICES_GRID_CAPABILITIES,
  makeKioskDevicesGridDescriptor,
} from './kiosk-devices-grid-descriptor';

export const KIOSKDEVICES_TABLE_DEFINITION = parseTableDefinition({
  id: 'settings.kiosk-devices',
  tableId: 'kiosk-devices',
  entityFamily: 'kiosk-devices',
  cellMapKey: 'kiosk-devices',
  ariaLabel: 'Kiosk devices',
  testId: 'kiosk-devices-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: KIOSKDEVICES_GRID_CAPABILITIES,
  columns: KIOSKDEVICES_COMPOUND_COLUMNS,
});

export const KIOSKDEVICES_TABLE_BINDING: TableSurfaceBinding<KioskDeviceTableRow, KioskDevicesGridColumn> = {
  definition: KIOSKDEVICES_TABLE_DEFINITION,
  columns: KIOSKDEVICES_COMPOUND_COLUMNS,
  makeDescriptor: makeKioskDevicesGridDescriptor,
  recordPlane: {
    kind: 'stage-overlay',
    reason:
      'Revoke confirm stacks as DeskStageOverlay over /settings/devices — table stays mounted (Q5). Pairing verbs stay on the row menu / trailing face.',
  },
};
