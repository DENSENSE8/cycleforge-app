/** Ready field catalog — the bindable recently-tested facts, as DATA. */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';

export const READY_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'ready.unit',
    family: 'ready',
    label: 'Unit',
    displayType: 'id',
    slotKinds: ['identity'],
    paths: { sku: 'sku', serial: 'serialNumber', fnsku: 'fnsku', asin: 'asin', fallbackId: 'entityId' },
  },
  {
    id: 'ready.verdict',
    family: 'ready',
    label: 'Verdict',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'verdict' },
  },
  {
    id: 'ready.destination',
    family: 'ready',
    label: 'Destination',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'disposition', fallback: 'allocationState', unitStatus: 'unitStatus' },
  },
  // The WHY behind Destination — rationale you open when a destination
  // surprises you, not a column you scan. The hand model shipped both
  // `tier: 'optional'` (off by default); here that is simply an unbound fact.
  {
    id: 'ready.reasons',
    family: 'ready',
    label: 'Reasons',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'reasons' },
  },
  {
    id: 'ready.velocity',
    family: 'ready',
    label: 'Velocity',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'velocityTier' },
  },
  {
    id: 'ready.condition',
    family: 'ready',
    label: 'Cond',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'conditionGrade' },
  },
  {
    id: 'ready.tested',
    family: 'ready',
    label: 'Tested',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'testedAt', by: 'testedByName' },
  },
];

/** The PRODUCT default Ready layout — visual parity with the retired hand model's CORE view (`select · title · verdict · destination ·… */
export const READY_PRODUCT_LAYOUT: DataTableColumnLayout = {
  morph: 'sheet',
  identityFieldId: 'ready.unit',
  statusBindings: [
    { fieldId: 'ready.verdict' },
    { fieldId: 'ready.destination' },
    { fieldId: 'ready.condition' },
    { fieldId: 'ready.tested' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
}

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Ready entry. */
export const READY_TABLE_LAYOUT_ID = 'ready';
