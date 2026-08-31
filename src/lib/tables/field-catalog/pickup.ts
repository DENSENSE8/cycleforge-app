/**
 * Pickup field catalog — the bindable Local-pickup facts, as DATA. The SECOND
 * family on the slot engine (plan §7.2 / kill-list 07 §4 — the "scope to any
 * table" milestone): same kernel, different vocabulary, no new table product.
 *
 * Every entry names a fact the `/api/local-pickup-orders/lines` feed already
 * returns on `PickupLine`; nothing here mints a column. `paths` documents the
 * row properties the resolver reads — resolution itself is
 * `./pickup-resolve.ts`, kept separate so this module stays a LEAF (the org
 * layout API route imports it server-side; the layout module imports it at
 * module scope — neither may drag in client code or the resolver's
 * formatting chain).
 *
 * Pickup is a SHEET morph: subtitle bindings open real `subtitle:N` columns
 * after the Order track (the first live consumer of the materializer's sheet
 * path), and status bindings open `status:N` after them. The frozen
 * `select · title` pane and the Order track are the structural base skeleton
 * (`PICKUP_SHEET_BASE` in `pickup-grid-layout.ts`) — `pickup.order` is the
 * IDENTITY fact that Order track resolves, not a free slot.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const PICKUP_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'pickup.order',
    family: 'pickup',
    label: 'Order',
    displayType: 'id',
    slotKinds: ['identity'],
    paths: { orderId: 'po_number', fallbackId: 'order_id' },
  },
  {
    id: 'pickup.date',
    family: 'pickup',
    label: 'Date',
    displayType: 'date',
    slotKinds: ['status'],
    paths: { value: 'pickup_date' },
  },
  {
    id: 'pickup.status',
    family: 'pickup',
    label: 'Status',
    displayType: 'tag',
    slotKinds: ['status'],
    paths: { value: 'order_status', receivingId: 'receiving_id' },
  },
  {
    id: 'pickup.sku',
    family: 'pickup',
    label: 'SKU',
    displayType: 'id',
    slotKinds: ['subtitle'],
    paths: { text: 'sku' },
  },
  {
    id: 'pickup.qty',
    family: 'pickup',
    label: 'Qty',
    displayType: 'number',
    slotKinds: ['subtitle'],
    paths: { value: 'quantity' },
  },
  {
    id: 'pickup.condition',
    family: 'pickup',
    label: 'Cond',
    displayType: 'tag',
    slotKinds: ['subtitle'],
    paths: { value: 'condition_grade' },
  },
  {
    id: 'pickup.price',
    family: 'pickup',
    label: 'Price',
    displayType: 'money',
    slotKinds: ['subtitle'],
    paths: { value: 'total_price' },
  },
  // The plan's §7.2 promise ("an org that cares about the customer binds it"):
  // the feed already carries the name; no default binding.
  {
    id: 'pickup.customer',
    family: 'pickup',
    label: 'Customer',
    displayType: 'text',
    slotKinds: ['subtitle'],
    paths: { text: 'customer_name' },
  },
];

/**
 * The PRODUCT default pickup layout — visual parity with the retired hand
 * model's CORE view (`select · title · order · date · status`): the Date and
 * Status facts in the status band, nothing under the title. SKU / Qty / Cond /
 * Price / Customer stay in the catalog for an org or staffer to bind — the old
 * `tier: 'optional'` ship-hidden columns, expressed as unbound facts.
 * `amountFieldId` is null: the sheet paints Price as a normal bound column,
 * not the compound amount track.
 * Guard: `pickup.test.ts` parses this against the catalog.
 */
export const PICKUP_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'sheet',
  identityFieldId: 'pickup.order',
  statusBindings: [{ fieldId: 'pickup.date' }, { fieldId: 'pickup.status' }],
  subtitleBindings: [],
  amountFieldId: null,
};

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Local-pickup entry. */
export const PICKUP_TABLE_LAYOUT_ID = 'pickup';
