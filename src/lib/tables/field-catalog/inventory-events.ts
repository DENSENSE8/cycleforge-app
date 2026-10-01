/** Inventory events field catalog — the bindable facts of one inventory event, as DATA. */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';

export const INVENTORY_EVENTS_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'inventory-events.occurred',
    family: 'inventory-events',
    label: 'When',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'occurred_at' },
  },
  {
    id: 'inventory-events.event_type',
    family: 'inventory-events',
    label: 'Event',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'event_type' },
  },
  // A TRANSITION, not a state: the pair is the fact ("Matched → Received"), so
  // it is one bindable field rather than two that only make sense together.
  {
    id: 'inventory-events.status_change',
    family: 'inventory-events',
    label: 'Status',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { prev: 'prev_status', next: 'next_status' },
  },
  {
    id: 'inventory-events.sku',
    family: 'inventory-events',
    label: 'SKU',
    displayType: 'id',
    slotKinds: ['identity', 'status', 'subtitle'],
    paths: { value: 'sku', title: 'product_title' },
  },
  {
    id: 'inventory-events.serial',
    family: 'inventory-events',
    label: 'Serial',
    displayType: 'id',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'serial_number' },
  },
  // Same shape as the status transition: a move reads `prev → next`, a put-away
  // reads the destination alone.
  {
    id: 'inventory-events.bin',
    family: 'inventory-events',
    label: 'Bin',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'bin_name', prev: 'prev_bin_name' },
  },
  {
    id: 'inventory-events.actor',
    family: 'inventory-events',
    label: 'Who',
    displayType: 'person',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'actor_name' },
  },
  {
    id: 'inventory-events.station',
    family: 'inventory-events',
    label: 'Station',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'station' },
  },
  {
    id: 'inventory-events.notes',
    family: 'inventory-events',
    label: 'Notes',
    displayType: 'note',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'notes' },
  },
];

/** The PRODUCT default — what an org with no override mounts. */
export const INVENTORY_EVENTS_PRODUCT_LAYOUT: DataTableColumnLayout = {
  // COMPOUND, not sheet (2026-09-04).
  morph: 'compound',
  identityFieldId: 'inventory-events.sku',
  statusBindings: [
    { fieldId: 'inventory-events.occurred' },
    { fieldId: 'inventory-events.event_type' },
    { fieldId: 'inventory-events.serial' },
    { fieldId: 'inventory-events.bin' },
    { fieldId: 'inventory-events.actor' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
}

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Inventory events entry. */
export const INVENTORY_EVENTS_TABLE_LAYOUT_ID = 'inventory-events';
