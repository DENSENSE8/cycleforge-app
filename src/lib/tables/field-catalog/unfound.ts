/**
 * Unfound-queue field catalog — the bindable PO-mailbox triage facts, as DATA.
 * Wave 1.4's sixth family (`docs/todo/seller-table-program-PLAN.md` §03;
 * `docs/kill-list/07-slot-table-hand-models.md` — the `unfound` row: "the
 * absence-of-a-line queue. Ticket/notes are subtitle/status facts; the row is
 * not a third editor grid.").
 *
 * Every entry names a fact `QueueRow` already carries off `v_unfound_queue`.
 * Resolution is `./unfound-resolve.ts`, kept separate so this module stays a
 * LEAF.
 *
 * Unfound is a SHEET morph. `unfound.item` is the IDENTITY fact — the row's
 * stable `${kind}:${source_id}` handle — and the structural Product track paints
 * the title over its PO / serial / tracking chips.
 *
 * The `action` track (Push / Synced) is an ACTION, not a fact: no `hideKey`, so
 * it is structural and the Fields menu never offers to hide a control. Same
 * treatment as Warranty's ticket button and Ready's Stage-FBA escape.
 *
 * `unfound.checked` IS in the catalog even though its cell is an interactive
 * checkbox: the fact is whether a human has cleared this row, and the write is
 * the cell's face for it. That is the opposite of the action track, whose
 * subject is not a row property at all.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

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

/**
 * The PRODUCT default unfound layout — visual parity with the hand model's full
 * ops set (`select · title · ticket · USA note · VN note · check · push`),
 * which is what the hand-rolled table always showed.
 * Guard: `unfound.test.ts` parses this against the catalog.
 */
export const UNFOUND_PRODUCT_LAYOUT: SlotLayout = {
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
};

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Unfound queue entry. */
export const UNFOUND_TABLE_LAYOUT_ID = 'unfound';
