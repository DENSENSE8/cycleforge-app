/**
 * Incoming field catalog — the bindable inbound-PO facts, as DATA. Wave 1.3's
 * second family (`docs/todo/seller-table-program-PLAN.md` §03;
 * `docs/kill-list/07-slot-table-hand-models.md` — the `incoming` row).
 *
 * Incoming and Receiving are the same ROW TYPE (`ReceivingLineRow`) read at two
 * different moments, and the kill list is precise about why they are still two
 * families: a second column model on the same component so Incoming and History
 * do not share prefs is "two layouts in code". Slots answer it properly — **two
 * tableIds, two `SlotLayout`s, one cell map**. This catalog is the second
 * vocabulary, not a second engine.
 *
 * The genuine difference is which lifecycle the row reports. Unbox / History /
 * Testing report `workflow_status` — what the WAREHOUSE has done to the line.
 * Incoming reports `delivery_state` — what the CARRIER has done to the box,
 * before the warehouse has touched it. `incoming.status` therefore resolves
 * through `incomingStateFace`, the same SoT the hunt tiles and the state pill
 * read, rather than duplicating a vocabulary.
 *
 * Incoming is a COMPOUND morph. `incoming.order` is the IDENTITY fact — the PO
 * the operator types — which the shared `fulfillment` chrome track resolves.
 *
 * ## Two facts deliberately NOT here, and why
 *
 * **Age.** The flat model's `age` track is a DURATION derived from the expected
 * date against now. It is not a row property, it changes without the row
 * changing, and the compound row already reports lateness on the state cell's
 * second line from the same number — a bound Age column would be a second
 * author of one fact.
 *
 * **The Zoho receipt chip.** Same refusal as `receiving.zoho`: a state derived
 * from several columns plus the connected-provider capability, whose own cell
 * already owns the derivation. On the DEFAULT Incoming lane it is also constant
 * by construction, which is why the flat model shipped it `optional`.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const INCOMING_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'incoming.order',
    family: 'incoming',
    label: 'Order',
    displayType: 'id',
    slotKinds: ['identity'],
    paths: { po: 'zoho_purchaseorder_number', ref: 'zoho_reference_number' },
  },
  {
    id: 'incoming.expected',
    family: 'incoming',
    label: 'Expected',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'po_date' },
  },
  {
    id: 'incoming.qty',
    family: 'incoming',
    label: 'Qty',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { expected: 'quantity_expected', received: 'quantity_received' },
  },
  {
    id: 'incoming.price',
    family: 'incoming',
    label: 'Price',
    displayType: 'money',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'unit_price' },
  },
  {
    id: 'incoming.status',
    family: 'incoming',
    label: 'Status',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'delivery_state' },
  },
  {
    id: 'incoming.platform',
    family: 'incoming',
    label: 'Platform',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'source_platform', fallback: 'inbound_source_type' },
  },
  {
    id: 'incoming.tracking',
    family: 'incoming',
    label: 'Tracking',
    displayType: 'tracking',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'tracking_number', carrier: 'carrier' },
  },
  // Set during unbox / triage, so it is the empty dash for nearly every row on
  // THIS surface — the old `tier: 'optional'`, expressed as an unbound fact.
  {
    id: 'incoming.condition',
    family: 'incoming',
    label: 'Cond',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'condition_grade' },
  },
];

/**
 * The PRODUCT default Incoming layout — the COMPOUND morph with **no bound
 * fact tracks**, which is byte-for-byte what the Incoming rails paint today.
 * Same parity argument as Receiving: reproduce, then improve. Every fact above
 * becomes bindable the same day without a deploy.
 * Guard: `incoming.test.ts` parses this against the catalog.
 */
export const INCOMING_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'incoming.order',
  statusBindings: [],
  subtitleBindings: [],
  amountFieldId: null,
};

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Incoming entry. */
export const INCOMING_TABLE_LAYOUT_ID = 'incoming';
