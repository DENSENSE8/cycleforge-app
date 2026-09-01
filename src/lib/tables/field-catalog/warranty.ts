/**
 * Warranty field catalog — the bindable claim facts, as DATA. Wave 1.4's third
 * family (`docs/todo/seller-table-program-PLAN.md` §03;
 * `docs/kill-list/07-slot-table-hand-models.md` — the `warranty` row:
 * "claim/serial/status. Structural action track stays a capability, not an org
 * column.").
 *
 * Every entry names a fact `WarrantyClaimListRow` already carries. Resolution
 * is `./warranty-resolve.ts`, kept separate so this module stays a LEAF.
 *
 * Warranty is a SHEET morph. `warranty.claim` is the IDENTITY fact — the claim
 * number, which the structural Claim track paints (the same shape pickup uses,
 * where `pickup.order` is identity and the Order track is structural). It is
 * therefore NOT in the status band: the slot write gate counts identity toward
 * duplicate bindings, and a fact cannot be both the row's handle and one of its
 * columns.
 *
 * ## The support ticket: the CONTROL stays, the FACT is bindable
 *
 * The `ticket` TRACK is an ACTION, not a fact — a row-scoped control a staffer
 * must never be able to hide and then wonder where it went. It stays in the
 * structural skeleton and is not offered in Fields, exactly as Ready's
 * Stage-FBA escape and Receiving's `actions` track are.
 *
 * WHETHER a claim has a linked ticket is a different thing, and it IS a fact
 * the row already carries (`zendeskTicketId`). It is in the catalog below,
 * unbound: an org that triages on "which claims have gone to support" binds it
 * and gets a column; the button beside it never moves. Removing a control and
 * making its subject bindable are opposite operations, and the port does the
 * second one only.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

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

/**
 * The PRODUCT default warranty layout — visual parity with the retired hand
 * model's CORE view (`select · title · claim · customer · status · warranty ·
 * logged · ticket`): the five questions a support operator on a phone call
 * actually asks — what is it, which claim, whose is it, what state is it in,
 * how much cover is left, and when was it logged. `warranty.serial` stays in
 * the catalog unbound.
 * Guard: `warranty.test.ts` parses this against the catalog.
 */
export const WARRANTY_PRODUCT_LAYOUT: SlotLayout = {
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
};

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Warranty claims entry. */
export const WARRANTY_TABLE_LAYOUT_ID = 'warranty';
