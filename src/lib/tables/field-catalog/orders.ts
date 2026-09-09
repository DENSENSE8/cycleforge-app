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
 * `orders.scanned_out` is a Shipped-lane fact. The shared Orders grid mounts
 * the same catalog on To-ship, Packed, Labels, and Shipped; {@link
 * omitShippedOnlyBindings} strips this field off every lane except Shipped so
 * a bound column cannot paint "Needed" against orders that already left (and
 * so a dock stamp never appears on a working queue). The stamp itself lives
 * on `ShippedOrder` (`ship_confirmed_at` / `shipped_out_by_name`).
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
    // Claimed-pending paints this verb (PICK); empty stays a dash. Done = Picked.
    stageLabels: { done: 'Picked', pending: 'Pick' },
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
    stageLabels: { done: 'Packed', pending: 'Pack' },
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
    // The listing handle. There is no `orders.listing_url` on the feed — the
    // title and the "Listing" subtitle control derive the storefront URL via
    // `getExternalUrlByItemNumber`. The id itself is never painted; hover copies it.
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
    slotKinds: ['subtitle'],
    paths: { value: 'sale_amount' },
  },
];

/**
 * The PRODUCT default To-ship layout: the pick step in status:1, and
 * `qty · amount · condition · item # · notes` under the title. Money is a
 * SUBTITLE binding, not `amountFieldId` — a field may not be bound twice.
 * Guard: `orders.test.ts` parses this against the catalog.
 */
export const ORDERS_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'orders.order_id',
  statusBindings: [{ fieldId: 'orders.picked' }],
  subtitleBindings: [
    { fieldId: 'orders.qty' },
    { fieldId: 'orders.amount' },
    { fieldId: 'orders.condition' },
    { fieldId: 'orders.item_number' },
    { fieldId: 'orders.notes' },
  ],
  amountFieldId: null,
};

/**
 * Status facts that belong on the Shipped lane only. A dock scan-out is not a
 * To-ship / Packed / Labels column — those desks are in-building work.
 */
export const SHIPPED_LANE_STATUS_FIELDS = ['orders.scanned_out'] as const;

/** Drop Shipped-only bindings so a working-queue layout cannot paint them. */
export function omitShippedOnlyBindings(layout: SlotLayout): SlotLayout {
  const drop = new Set<string>(SHIPPED_LANE_STATUS_FIELDS);
  const statusBindings = layout.statusBindings.filter((b) => !drop.has(b.fieldId));
  if (statusBindings.length === layout.statusBindings.length) return layout;
  return { ...layout, statusBindings };
}

/** The one tableId this catalog serves — `PRODUCT_TABLES`' To-ship entry. */
export const ORDERS_TABLE_LAYOUT_ID = 'orders';
