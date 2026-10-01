/** Warranty field catalog — the bindable claim facts, as DATA. */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';

export const WARRANTY_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'warranty.claim',
    family: 'warranty',
    label: 'Claim',
    displayType: 'id',
    slotKinds: ['identity'],
    paths: { value: 'claimNumber' },
  },
  // The lookup key you arrive BY, not one you scan down a column — and it
  // duplicates the item cell on most rows. The old `tier: 'optional'`,
  // expressed as an unbound fact.
  {
    id: 'warranty.serial',
    family: 'warranty',
    label: 'Serial',
    displayType: 'id',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'serialNumber' },
  },
  {
    id: 'warranty.customer',
    family: 'warranty',
    label: 'Customer',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'customerName' },
  },
  {
    id: 'warranty.status',
    family: 'warranty',
    label: 'Status',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'status' },
  },
  // How much cover is left. Categorical ("14d left" / "Expired"), not a figure
  // compared digit-by-digit — so it reads as a tag; sorting still runs on
  // `daysRemaining`.
  {
    id: 'warranty.clock',
    family: 'warranty',
    label: 'Warranty',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { days: 'daysRemaining', basis: 'clockBasis' },
  },
  // The linked Zendesk ticket — the FACT behind the structural ticket control.
  // Unbound by default: the button already says whether one exists on the row
  // an operator is looking at; a column answers it for a whole queue at once.
  {
    id: 'warranty.ticket',
    family: 'warranty',
    label: 'Support ticket',
    displayType: 'id',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'zendeskTicketId' },
  },
  {
    id: 'warranty.logged',
    family: 'warranty',
    label: 'Logged',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'createdAt' },
  },
];

/** The PRODUCT default warranty layout — visual parity with the retired hand model's CORE view (`select · title · claim · customer · status… */
export const WARRANTY_PRODUCT_LAYOUT: DataTableColumnLayout = {
  morph: 'sheet',
  identityFieldId: 'warranty.claim',
  statusBindings: [
    { fieldId: 'warranty.customer' },
    { fieldId: 'warranty.status' },
    { fieldId: 'warranty.clock' },
    { fieldId: 'warranty.logged' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
}

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Warranty claims entry. */
export const WARRANTY_TABLE_LAYOUT_ID = 'warranty';
