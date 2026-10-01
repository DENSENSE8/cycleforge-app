/** Search-hits field catalog — the bindable facts of ONE cross-entity find result, as DATA. */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';

export const SEARCH_HITS_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'search-hits.identifier',
    family: 'search-hits',
    label: 'Id',
    displayType: 'id',
    slotKinds: ['identity', 'status', 'subtitle'],
    paths: {
      order: 'facets.order_id',
      po: 'facets.po_number',
      sourceOrder: 'facets.source_order_id',
      serial: 'facets.serial_number',
      tracking: 'facets.tracking_number',
      fallback: 'id',
    },
  },
  {
    id: 'search-hits.entity',
    family: 'search-hits',
    label: 'Type',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'entityType' },
  },
  {
    id: 'search-hits.status',
    family: 'search-hits',
    label: 'Status',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'facets.status' },
  },
  {
    id: 'search-hits.description',
    family: 'search-hits',
    label: 'Description',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'title' },
  },
  {
    id: 'search-hits.channel',
    family: 'search-hits',
    label: 'Channel',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'facets.source_platform' },
  },
  {
    id: 'search-hits.tracking',
    family: 'search-hits',
    label: 'Tracking',
    displayType: 'tracking',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'facets.tracking_number' },
  },
  {
    id: 'search-hits.serial',
    family: 'search-hits',
    label: 'Serial',
    displayType: 'id',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'facets.serial_number' },
  },
  {
    id: 'search-hits.condition',
    family: 'search-hits',
    label: 'Condition',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'facets.condition_grade' },
  },
  {
    /** WHY this row is in the list — the field the query matched. */
    id: 'search-hits.matched',
    family: 'search-hits',
    label: 'Matched',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'matchField' },
  },
  {
    id: 'search-hits.when',
    family: 'search-hits',
    label: 'When',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'facets.happened_at' },
  },
];

/** The PRODUCT default — the operator's requested reading order, as far as the shared skeleton allows it. */
export const SEARCH_HITS_PRODUCT_LAYOUT: DataTableColumnLayout = {
  morph: 'compound',
  identityFieldId: 'search-hits.identifier',
  statusBindings: [
    { fieldId: 'search-hits.entity' },
    { fieldId: 'search-hits.tracking' },
    { fieldId: 'search-hits.matched' },
  ],
  subtitleBindings: [
    { fieldId: 'search-hits.serial' },
    { fieldId: 'search-hits.condition' },
  ],
  amountFieldId: null,
}

/** The tableId this catalog serves — `PRODUCT_TABLES`' find-plane entry. */
export const SEARCH_HITS_TABLE_LAYOUT_ID = 'search-hits';
