/**
 * Orders field catalog — the bindable To-ship triage facts, as DATA.
 *
 * Plan: `docs/todo/slot-based-metadata-table-PLAN.md` §7.1. Every entry names a
 * fact the `/api/orders` unshipped feed already returns (or types); nothing
 * here mints a column. `paths` documents the row aliases the resolver reads —
 * the resolution itself is `./orders-resolve.ts`, kept separate so this module
 * stays a leaf (the org-layout API route imports it server-side, and
 * `dashboard-order-row-layout.ts` imports it at module scope; neither may drag
 * in the resolver's formatting chain).
 *
 * `orders.scanned_out` is honest about its data: the fields exist on
 * `ShippedOrder` (`ship_confirmed_at` / `shipped_out_by_name`) but the To-ship
 * projection does not select them yet, so a bound Scanned-out column reads
 * pending until that stamp lands — which the stage_event cell is designed for
 * (icon + dash on the top line; the who·time line stays blank).
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const ORDERS_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'orders.order_id',
    family: 'orders',
    label: 'Order',
    displayType: 'id',
    slotKinds: ['identity'],
    paths: { orderId: 'order_id', tracking: 'shipping_tracking_number' },
  },
  {
    // Pick = inventory → pack handoff (industry WMS). Distinct from Packed
    // (cartonize) and from Testing QC (`/test`). Feed stamps still ride the
    // legacy tester/test_date columns until a dedicated pick projection lands;
    // the SLOT id and verbs are Pick so org layouts speak the right language.
    id: 'orders.picked',
    family: 'orders',
    label: 'Pick',
    displayType: 'stage_event',
    slotKinds: ['status'],
    iconKey: 'picked',
    // Pending face is accessible-name only when the cell dashes (operator
    // ruling 2026-08-30). One word, state-flavoured — never an imperative.
    stageLabels: { done: 'Picked', pending: 'Needed' },
    paths: {
      who: 'tested_by_name|tester_name',
      at: 'test_date_time|test_activity_at',
      station: 'test_location_name',
    },
  },
  {
    id: 'orders.packed',
    family: 'orders',
    label: 'Packed',
    displayType: 'stage_event',
    slotKinds: ['status'],
    iconKey: 'packed',
    stageLabels: { done: 'Packed', pending: 'Needed' },
    paths: {
      who: 'packed_by_name|packer_name',
      at: 'packed_at|pack_activity_at',
      station: 'pack_location_name',
    },
  },
  {
    id: 'orders.scanned_out',
    family: 'orders',
    label: 'Scanned out',
    displayType: 'stage_event',
    slotKinds: ['status'],
    iconKey: 'scanned_out',
    stageLabels: { done: 'Scanned', pending: 'Needed' },
    paths: { who: 'shipped_out_by_name', at: 'ship_confirmed_at' },
  },
  // No `orders.title` subtitle field: the item cell's FIRST line already IS
  // the product title, and a binding that repeats it under itself is noise.
  {
    id: 'orders.item_number',
    family: 'orders',
    label: 'Item #',
    displayType: 'text',
    slotKinds: ['subtitle'],
    paths: { text: 'item_number' },
  },
  {
    id: 'orders.qty',
    family: 'orders',
    label: 'Qty',
    displayType: 'number',
    slotKinds: ['subtitle'],
    paths: { value: 'quantity' },
  },
  {
    id: 'orders.condition',
    family: 'orders',
    label: 'Cond',
    displayType: 'tag',
    slotKinds: ['subtitle'],
    paths: { value: 'condition' },
  },
  {
    id: 'orders.notes',
    family: 'orders',
    label: 'Notes',
    displayType: 'note',
    slotKinds: ['subtitle'],
    paths: { text: 'notes' },
  },
  {
    id: 'orders.amount',
    family: 'orders',
    label: 'Amount',
    displayType: 'money',
    slotKinds: ['amount'],
    paths: { value: 'sale_amount' },
  },
];

/**
 * The PRODUCT default To-ship layout: the pick step in status:1, and
 * `qty · condition · notes` under the title (operator lock 2026-08-30, in
 * that order) — an org with no override sees the secondary line without
 * binding anything. Packed / Scanned out stay in the catalog for an org to
 * bind. `amountFieldId` DOCUMENTS the money fact in slot terms; this ship
 * the compound chrome's amount track still paints `sale_amount` directly
 * through the adapter (`ordersCompoundView`), so the binding is declarative
 * until the amount cell resolves through the catalog.
 * Guard: `orders.test.ts` parses this against the catalog.
 */
export const ORDERS_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'orders.order_id',
  statusBindings: [{ fieldId: 'orders.picked' }],
  subtitleBindings: [
    { fieldId: 'orders.qty' },
    { fieldId: 'orders.condition' },
    { fieldId: 'orders.notes' },
  ],
  amountFieldId: 'orders.amount',
};

/** The one tableId this catalog serves — `PRODUCT_TABLES`' To-ship entry. */
export const ORDERS_TABLE_LAYOUT_ID = 'orders';
