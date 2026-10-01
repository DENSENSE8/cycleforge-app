/** Units field catalog — the bindable serialized-unit facts, as DATA. */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';

export const UNITS_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'units.serial',
    family: 'units',
    label: 'Serial',
    displayType: 'id',
    slotKinds: ['identity'],
    paths: { value: 'serial_number' },
  },
  {
    id: 'units.status',
    family: 'units',
    label: 'Status',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'current_status' },
  },
  {
    id: 'units.condition',
    family: 'units',
    label: 'Condition',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'condition_grade' },
  },
  // "Where the thing physically is" — the plan's §08 Bin candidate, which this
  // family's feed has carried all along.
  {
    id: 'units.location',
    family: 'units',
    label: 'Location',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'current_location' },
  },
  {
    id: 'units.updated',
    family: 'units',
    label: 'Updated',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'updated_at' },
  },
];

/** The PRODUCT default units layout — visual parity with the retired hand model (`serial · product · status · condition · location · updated`): */
export const UNITS_PRODUCT_LAYOUT: DataTableColumnLayout = {
  morph: 'sheet',
  identityFieldId: 'units.serial',
  statusBindings: [
    { fieldId: 'units.status' },
    { fieldId: 'units.condition' },
    { fieldId: 'units.location' },
    { fieldId: 'units.updated' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
}

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Inventory units entry. */
export const UNITS_TABLE_LAYOUT_ID = 'inventory-units';
