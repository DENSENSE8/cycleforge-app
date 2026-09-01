/**
 * Repair field catalog — the bindable walk-in / repair-desk facts, as DATA.
 * Wave 1.4's seventh family (`docs/todo/seller-table-program-PLAN.md` §03;
 * `docs/kill-list/07-slot-table-hand-models.md` — the `repair` row:
 * "walk-in/repair facts (customer, phone, ticket) belong in a catalog so an org
 * can put phone in subtitle:2 without a deploy").
 *
 * Every entry names a fact `RSRecord` already carries. Resolution is
 * `./repair-resolve.ts`, which also owns the pure display helpers the row and
 * the comparator share — the display↔sort SoT this family already had, moved to
 * the leaf so a bound column reads exactly what the cell paints.
 *
 * Repair is a SHEET morph. `repair.service` is the IDENTITY fact — the
 * `repair_services.id` handle. The RS-#### the desk quotes on the phone is
 * `repair.ticket`, a normal bound fact: the write gate counts identity toward
 * duplicate bindings, so the row's handle and one of its columns cannot be the
 * same field.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const REPAIR_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'repair.service',
    family: 'repair',
    label: 'Service',
    displayType: 'id',
    slotKinds: ['identity'],
    paths: { value: 'id' },
  },
  {
    id: 'repair.created',
    family: 'repair',
    label: 'Created',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'created_at' },
  },
  {
    id: 'repair.customer',
    family: 'repair',
    label: 'Customer',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { name: 'customer_name', fallback: 'contact_info' },
  },
  // Contact detail — and PII — that only matters once you open the ticket. The
  // old `tier: 'optional'`, expressed as an unbound fact. The plan's §17 asks
  // how much customer identity belongs on a warehouse desk; leaving this
  // unbound is that question answered conservatively until it is ruled on.
  {
    id: 'repair.phone',
    family: 'repair',
    label: 'Phone',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { phone: 'customer_phone', fallback: 'contact_info' },
  },
  {
    id: 'repair.price',
    family: 'repair',
    label: 'Price',
    displayType: 'money',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'price' },
  },
  // Reads "Walk-in" on the overwhelming majority of rows, so as a DEFAULT track
  // it is a near-constant column — the same argument that keeps a status chip
  // out of the review queues. Unbound; an org whose repairs mostly come from
  // orders binds it.
  {
    id: 'repair.order',
    family: 'repair',
    label: 'Walk-in / Order',
    displayType: 'id',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'source_order_id' },
  },
  {
    id: 'repair.ticket',
    family: 'repair',
    label: 'Ticket',
    displayType: 'id',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'ticket_number' },
  },
  {
    id: 'repair.status',
    family: 'repair',
    label: 'Status',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'status' },
  },
];

/**
 * The PRODUCT default repair layout — visual parity with the retired hand
 * model's CORE view (`select · title · created · customer · ticket`): what came
 * in, when, whose it is, and the RS-#### the desk quotes on the phone. Phone,
 * price and order stay unbound (the old `tier: 'optional'`), and status joins
 * them as a fact the hand model never printed.
 * Guard: `repair.test.ts` parses this against the catalog.
 */
export const REPAIR_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'sheet',
  identityFieldId: 'repair.service',
  statusBindings: [
    { fieldId: 'repair.created' },
    { fieldId: 'repair.customer' },
    { fieldId: 'repair.ticket' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
};

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Repair queue entry. */
export const REPAIR_TABLE_LAYOUT_ID = 'repair';
