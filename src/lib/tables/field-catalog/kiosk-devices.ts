/** Kiosk-devices field catalog — the bindable facts of one enrolled tablet. */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';

export const KIOSKDEVICES_FIELD_CATALOG: FieldCatalog = [
  { id: 'kiosk-devices.id', family: 'kiosk-devices', label: 'Device', displayType: 'id', slotKinds: ['identity', 'status', 'subtitle'], paths: { value: 'id' } },
  { id: 'kiosk-devices.label', family: 'kiosk-devices', label: 'Tablet', displayType: 'text', slotKinds: ['status', 'subtitle'], paths: { value: 'label' } },
  { id: 'kiosk-devices.status', family: 'kiosk-devices', label: 'Status', displayType: 'tag', slotKinds: ['status', 'subtitle'], paths: { value: 'status' } },
  { id: 'kiosk-devices.terminal', family: 'kiosk-devices', label: 'Card reader', displayType: 'id', slotKinds: ['status', 'subtitle'], paths: { value: 'squareTerminalDeviceId' } },
  { id: 'kiosk-devices.last_seen', family: 'kiosk-devices', label: 'Last seen', displayType: 'date', slotKinds: ['status', 'subtitle'], paths: { value: 'lastSeenAt' } },
  { id: 'kiosk-devices.enrolled', family: 'kiosk-devices', label: 'Enrolled', displayType: 'date', slotKinds: ['status', 'subtitle'], paths: { value: 'createdAt' } },
  { id: 'kiosk-devices.enrolled_by', family: 'kiosk-devices', label: 'Enrolled by', displayType: 'person', slotKinds: ['status', 'subtitle'], paths: { display: 'enrolledByName', name: 'enrolledByName', value: 'enrolledByStaffId' } },
  { id: 'kiosk-devices.dwell', family: 'kiosk-devices', label: 'Dwell', displayType: 'number', slotKinds: ['status', 'subtitle'], paths: { value: 'dwellSeconds' } },
  { id: 'kiosk-devices.hardware', family: 'kiosk-devices', label: 'Hardware', displayType: 'tag', slotKinds: ['status', 'subtitle'], paths: { value: 'hardwareStatus' } },
];

/**
 * `label` and `status` paint as the row TITLE and the state pill — not tracks.
 * Last seen / enrolled ride the Dates chrome (Hash line) via the row adapter;
 * terminal · hardware · enrolled_by are status bindings.
 */
export const KIOSKDEVICES_PRODUCT_LAYOUT: DataTableColumnLayout = {
  morph: 'compound',
  identityFieldId: 'kiosk-devices.id',
  statusBindings: [
    { fieldId: 'kiosk-devices.terminal' },
    { fieldId: 'kiosk-devices.hardware' },
    { fieldId: 'kiosk-devices.enrolled_by' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
}

export const KIOSKDEVICES_TABLE_LAYOUT_ID = 'kiosk-devices';
