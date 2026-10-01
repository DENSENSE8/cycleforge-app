/** Unfound-queue field catalog — the bindable PO-mailbox triage facts, as DATA. */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';

export const UNFOUND_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'unfound.item',
    family: 'unfound',
    label: 'Item',
    displayType: 'id',
    slotKinds: ['identity'],
    paths: { kind: 'kind', sourceId: 'source_id' },
  },
  {
    id: 'unfound.ticket',
    family: 'unfound',
    label: 'Ticket',
    displayType: 'id',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'zendesk_ticket_id' },
  },
  {
    id: 'unfound.usa_note',
    family: 'unfound',
    label: 'USA Team Note',
    displayType: 'note',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'usa_team_note' },
  },
  {
    id: 'unfound.vietnam_note',
    family: 'unfound',
    label: 'Vietnam Team Note',
    displayType: 'note',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'vietnam_team_note' },
  },
  {
    id: 'unfound.checked',
    family: 'unfound',
    label: 'Check',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'checked', at: 'checked_at' },
  },
  // The queue's own age — how long this row has gone uncleared. The hand model
  // never printed it; unbound, so the port reproduces before it improves.
  {
    id: 'unfound.created',
    family: 'unfound',
    label: 'Seen',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'created_at' },
  },
];

/** The PRODUCT default unfound layout — visual parity with the hand model's full ops set (`select · title · ticket · USA note · VN note ·… */
export const UNFOUND_PRODUCT_LAYOUT: DataTableColumnLayout = {
  morph: 'sheet',
  identityFieldId: 'unfound.item',
  statusBindings: [
    { fieldId: 'unfound.ticket' },
    { fieldId: 'unfound.usa_note' },
    { fieldId: 'unfound.vietnam_note' },
    { fieldId: 'unfound.checked' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
}

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Unfound queue entry. */
export const UNFOUND_TABLE_LAYOUT_ID = 'unfound';
