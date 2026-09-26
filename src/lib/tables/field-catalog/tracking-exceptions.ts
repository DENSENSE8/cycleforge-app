/** Tracking-exception field catalog — the bindable unmatched-scan facts, as DATA. */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const TRACKING_EXCEPTIONS_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'tracking-exceptions.tracking',
    family: 'tracking-exceptions',
    label: 'Tracking',
    displayType: 'id',
    slotKinds: ['identity'],
    paths: { value: 'tracking_number' },
  },
  {
    id: 'tracking-exceptions.carrier',
    family: 'tracking-exceptions',
    label: 'Carrier',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { join: 'receiving_carrier', metadata: 'domain_metadata' },
  },
  {
    id: 'tracking-exceptions.reason',
    family: 'tracking-exceptions',
    label: 'Reason',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'exception_reason' },
  },
  {
    id: 'tracking-exceptions.status',
    family: 'tracking-exceptions',
    label: 'Status',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'status' },
  },
  {
    id: 'tracking-exceptions.created',
    family: 'tracking-exceptions',
    label: 'Created',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'created_at' },
  },
  // Attribution and Zoho-sync detail: useful when investigating ONE row, not
  // columns you scan down the queue. The old `tier: 'optional'` set, expressed
  // as unbound facts.
  {
    id: 'tracking-exceptions.source',
    family: 'tracking-exceptions',
    label: 'Source',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'source_station' },
  },
  {
    id: 'tracking-exceptions.staff',
    family: 'tracking-exceptions',
    label: 'Staff',
    displayType: 'person',
    slotKinds: ['status', 'subtitle'],
    paths: { display: 'staff_display_name', name: 'staff_name' },
  },
  {
    id: 'tracking-exceptions.retries',
    family: 'tracking-exceptions',
    label: 'Retries',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'zoho_check_count' },
  },
  {
    id: 'tracking-exceptions.last_check',
    family: 'tracking-exceptions',
    label: 'Last check',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'last_zoho_check_at' },
  },
  {
    id: 'tracking-exceptions.notes',
    family: 'tracking-exceptions',
    label: 'Notes',
    displayType: 'note',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'notes' },
  },
];

/** The PRODUCT default layout — visual parity with the retired hand model's CORE view (`select · title · carrier · reason · status ·… */
export const TRACKING_EXCEPTIONS_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'sheet',
  identityFieldId: 'tracking-exceptions.tracking',
  statusBindings: [
    { fieldId: 'tracking-exceptions.carrier' },
    { fieldId: 'tracking-exceptions.reason' },
    { fieldId: 'tracking-exceptions.status' },
    { fieldId: 'tracking-exceptions.created' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
};

/** The one tableId this catalog serves — the Tracking exceptions queue. */
export const TRACKING_EXCEPTIONS_TABLE_LAYOUT_ID = 'tracking-exceptions';
