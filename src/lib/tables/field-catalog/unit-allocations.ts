/** Unit-allocations field catalog — the bindable facts of ONE `order_unit_allocations` reservation, as DATA. */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';

export const UNIT_ALLOCATIONS_FIELD_CATALOG: FieldCatalog = [
  /** The IDENTITY fact — the ORDER holding the unit. */
  {
    id: 'unit-allocations.order',
    family: 'unit-allocations',
    label: 'Order',
    displayType: 'id',
    slotKinds: ['identity', 'status', 'subtitle'],
    paths: { value: 'order_id' },
  },
  /** The reserved UNIT. */
  {
    id: 'unit-allocations.unit',
    family: 'unit-allocations',
    label: 'Unit',
    displayType: 'id',
    slotKinds: ['identity', 'status', 'subtitle'],
    paths: { value: 'serial_unit_id' },
  },
  {
    id: 'unit-allocations.state',
    family: 'unit-allocations',
    label: 'State',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'state' },
  },
  {
    id: 'unit-allocations.allocated',
    family: 'unit-allocations',
    label: 'Allocated',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'allocated_at' },
  },
  {
    id: 'unit-allocations.released',
    family: 'unit-allocations',
    label: 'Released',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'released_at' },
  },
  /**
   * WHY it was released, in whatever words the releasing path wrote. Prose
   * about one row, which is what an under-title line is for — never a track
   * of truncated sentences.
   */
  {
    id: 'unit-allocations.reason',
    family: 'unit-allocations',
    label: 'Reason',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'released_reason' },
  },
  /** WHO allocated it. */
  {
    id: 'unit-allocations.allocated_by',
    family: 'unit-allocations',
    label: 'By',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'allocated_by_name' },
  },
];

/** The PRODUCT default — byte-for-byte the five facts the retired hand table painted, with three of them on the shared row chrome. */
export const UNIT_ALLOCATIONS_PRODUCT_LAYOUT: DataTableColumnLayout = {
  morph: 'compound',
  identityFieldId: 'unit-allocations.order',
  statusBindings: [{ fieldId: 'unit-allocations.released' }],
  subtitleBindings: [{ fieldId: 'unit-allocations.reason' }],
  amountFieldId: null,
}

/** The tableId this catalog serves — `PRODUCT_TABLES`' allocations entry. */
export const UNIT_ALLOCATIONS_TABLE_LAYOUT_ID = 'unit-allocations';
