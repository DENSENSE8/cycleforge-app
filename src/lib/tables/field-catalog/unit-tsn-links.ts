/** Unit-TSN-links field catalog — the bindable facts of ONE `tech_serial_numbers` cross-reference row, as DATA. */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';

export const UNIT_TSN_LINKS_FIELD_CATALOG: FieldCatalog = [
  /** The IDENTITY fact — the v1 row's own id. */
  {
    id: 'unit-tsn-links.tsn',
    family: 'unit-tsn-links',
    label: 'TSN id',
    displayType: 'id',
    slotKinds: ['identity', 'status', 'subtitle'],
    paths: { value: 'id' },
  },
  {
    id: 'unit-tsn-links.created',
    family: 'unit-tsn-links',
    label: 'When',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'created_at' },
  },
  {
    id: 'unit-tsn-links.station',
    family: 'unit-tsn-links',
    label: 'Station',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'station_source' },
  },
  {
    id: 'unit-tsn-links.serial_type',
    family: 'unit-tsn-links',
    label: 'Type',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'serial_type' },
  },
  {
    id: 'unit-tsn-links.shipment',
    family: 'unit-tsn-links',
    label: 'Shipment',
    displayType: 'id',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'shipment_id' },
  },
  /**
   * WHO tested it. `text`, not `person`: this feed carries a NAME off a v1
   * join and no staff id, so a person face would have nothing to resolve an
   * avatar from — and a v1 tester may not be current staff at all.
   */
  {
    id: 'unit-tsn-links.tested_by',
    family: 'unit-tsn-links',
    label: 'Tested by',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'tested_by_name' },
  },
];

/** The PRODUCT default — byte-for-byte the six facts the retired hand table painted, four of them on the shared row chrome. */
export const UNIT_TSN_LINKS_PRODUCT_LAYOUT: DataTableColumnLayout = {
  morph: 'compound',
  identityFieldId: 'unit-tsn-links.tsn',
  statusBindings: [
    { fieldId: 'unit-tsn-links.shipment' },
    { fieldId: 'unit-tsn-links.tested_by' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
}

/** The tableId this catalog serves — `PRODUCT_TABLES`' TSN-links entry. */
export const UNIT_TSN_LINKS_TABLE_LAYOUT_ID = 'unit-tsn-links';
