/** Kiosk slot-events field catalog — one physical slot / lane state transition. */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';

export const KIOSKSLOTEVENTS_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'kiosk-slot-events.device',
    family: 'kiosk-slot-events',
    label: 'Device',
    displayType: 'id',
    slotKinds: ['identity', 'status', 'subtitle'],
    paths: { value: 'kioskDeviceId', title: 'deviceLabel' },
  },
  {
    id: 'kiosk-slot-events.occurred',
    family: 'kiosk-slot-events',
    label: 'When',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'occurredAt' },
  },
  {
    id: 'kiosk-slot-events.slot',
    family: 'kiosk-slot-events',
    label: 'Slot',
    displayType: 'id',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'slotKey' },
  },
  {
    id: 'kiosk-slot-events.status_change',
    family: 'kiosk-slot-events',
    label: 'Transition',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { prev: 'fromState', next: 'toState' },
  },
  {
    id: 'kiosk-slot-events.dwell',
    family: 'kiosk-slot-events',
    label: 'Dwell',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'dwellMs' },
  },
  {
    id: 'kiosk-slot-events.hardware',
    family: 'kiosk-slot-events',
    label: 'Hardware',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'hardwareStatus' },
  },
];

/**
 * PRODUCT default. Chrome carries device title + landing state; tracks carry
 * when / slot / transition / dwell / hardware — facts the chrome cannot say.
 */
export const KIOSKSLOTEVENTS_PRODUCT_LAYOUT: DataTableColumnLayout = {
  morph: 'compound',
  identityFieldId: 'kiosk-slot-events.device',
  statusBindings: [
    { fieldId: 'kiosk-slot-events.occurred' },
    { fieldId: 'kiosk-slot-events.slot' },
    { fieldId: 'kiosk-slot-events.status_change' },
    { fieldId: 'kiosk-slot-events.dwell' },
    { fieldId: 'kiosk-slot-events.hardware' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
}

/** The one tableId this catalog serves — `PRODUCT_TABLES` entry. */
export const KIOSKSLOTEVENTS_TABLE_LAYOUT_ID = 'kiosk-slot-events';
