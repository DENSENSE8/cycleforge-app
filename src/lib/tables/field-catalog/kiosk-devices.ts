/**
 * Kiosk-devices field catalog — the bindable facts of one enrolled tablet.
 *
 * Off `AdminTable` 2026-09-05. Its pairing verbs moved from a trailing ACTIONS
 * cell to row verbs, which is what let the section mount the shared row.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const KIOSKDEVICES_FIELD_CATALOG: FieldCatalog = [
  { id: 'kiosk-devices.id', family: 'kiosk-devices', label: 'Device', displayType: 'id', slotKinds: ['identity', 'status', 'subtitle'], paths: { value: 'id' } },
  { id: 'kiosk-devices.label', family: 'kiosk-devices', label: 'Tablet', displayType: 'text', slotKinds: ['status', 'subtitle'], paths: { value: 'label' } },
  { id: 'kiosk-devices.status', family: 'kiosk-devices', label: 'Status', displayType: 'tag', slotKinds: ['status', 'subtitle'], paths: { value: 'status' } },
  { id: 'kiosk-devices.terminal', family: 'kiosk-devices', label: 'Card reader', displayType: 'id', slotKinds: ['status', 'subtitle'], paths: { value: 'squareTerminalDeviceId' } },
  { id: 'kiosk-devices.last_seen', family: 'kiosk-devices', label: 'Last seen', displayType: 'date', slotKinds: ['status', 'subtitle'], paths: { value: 'lastSeenAt' } },
  { id: 'kiosk-devices.enrolled', family: 'kiosk-devices', label: 'Enrolled', displayType: 'date', slotKinds: ['status', 'subtitle'], paths: { value: 'createdAt' } },
];

/** `label` and `status` paint as the row TITLE and the state pill — not tracks. */
export const KIOSKDEVICES_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'kiosk-devices.id',
  statusBindings: [
    { fieldId: 'kiosk-devices.terminal' },
    { fieldId: 'kiosk-devices.last_seen' },
    { fieldId: 'kiosk-devices.enrolled' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
};

export const KIOSKDEVICES_TABLE_LAYOUT_ID = 'kiosk-devices';
