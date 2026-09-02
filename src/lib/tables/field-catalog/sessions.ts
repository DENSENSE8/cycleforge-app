/**
 * Sessions field catalog — staff × warehouse-day active time.
 * Sibling of Daily/Tasks: same compound slots, different store (`work_sessions`).
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const SESSIONS_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'sessions.staff',
    family: 'sessions',
    label: 'Staff',
    displayType: 'id',
    slotKinds: ['identity'],
    paths: { id: 'staffId' },
  },
  {
    id: 'sessions.status',
    family: 'sessions',
    label: 'Status',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'status' },
  },
  {
    id: 'sessions.duration',
    family: 'sessions',
    label: 'Active',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'activeMs' },
  },
  {
    id: 'sessions.station',
    family: 'sessions',
    label: 'Station',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'lastScanType' },
  },
  {
    id: 'sessions.blocks',
    family: 'sessions',
    label: 'Blocks',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'sessionCount' },
  },
];

export const SESSIONS_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'sessions.staff',
  statusBindings: [],
  subtitleBindings: [],
  amountFieldId: null,
};

export const SESSIONS_TABLE_LAYOUT_ID = 'sessions';
