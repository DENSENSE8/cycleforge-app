/** Orders field catalog — the bindable To-ship triage facts, as DATA. */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';
import { ORDER_DATE_LABEL } from '@/lib/orders/order-dates';

export const ORDERS_FIELD_CATALOG = [
  {
    id: 'orders.order_id',
    family: 'orders',
    label: 'Order',
    displayType: 'id',
    slotKinds: ['identity'],
    paths: { orderId: 'order_id', tracking: 'shipping_tracking_number' },
  },
  {
    // Pick = inventory → pack handoff (industry WMS).
    id: 'orders.picked',
    family: 'orders',
    label: 'Pick',
    displayType: 'stage_event',
    slotKinds: ['status'],
    iconKey: 'picked',
    // Claimed-pending paints this verb (PICK); empty stays a dash. Done = Picked.
    stageLabels: { done: 'Picked', pending: 'Pick' },
    paths: {
      who: 'picked_by_name',
      at: 'picked_at',
    },
  },
  {
    id: 'orders.packed',
    family: 'orders',
    label: 'Pack',
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
] as const satisfies FieldCatalog;

/** The PRODUCT default To-ship layout: */
export const ORDERS_PRODUCT_LAYOUT: DataTableColumnLayout = {
  morph: 'compound',
  identityFieldId: 'orders.order_id',
  statusBindings: [{ fieldId: 'orders.picked' }, { fieldId: 'orders.packed' }],
  subtitleBindings: [
    { fieldId: 'orders.qty' },
    { fieldId: 'orders.amount' },
    { fieldId: 'orders.condition' },
    { fieldId: 'orders.item_number' },
    { fieldId: 'orders.notes' },
  ],
  amountFieldId: null,
}

/**
 * Status facts that belong on the Shipped lane only. A dock scan-out is not a
 * To-ship / Packed / Labels column — those desks are in-building work.
 */
const SHIPPED_LANE_STATUS_FIELDS = ['orders.scanned_out'] as const;

/** Drop Shipped-only bindings so a working-queue layout cannot paint them. */
export function omitShippedOnlyBindings(layout: DataTableColumnLayout): DataTableColumnLayout { const drop = new Set<string>(SHIPPED_LANE_STATUS_FIELDS);
const statusBindings = layout.statusBindings.filter((b) => !drop.has(b.fieldId));
if (statusBindings.length === layout.statusBindings.length) return layout;
return { ...layout, statusBindings }; }

/** The one tableId this catalog serves — `PRODUCT_TABLES`' To-ship entry. */
export const ORDERS_TABLE_LAYOUT_ID = 'orders';

/**
 * ORDER-level facts — the To-ship INDEX face (owner 2026-09-26: a Shopify-admin
 * order list, one row per ORDER). Each resolves over ALL of an order's lines
 * (`resolveOrdersIndexValue`), so a group parent and a single-line row paint the
 * same fact. Ids avoid the `.qty` / `.amount` suffixes on purpose: those are the
 * LINE laws that pin qty and price under an item title, and the index has no
 * item title — Items and Total are order sums, not lines.
 */
const ORDERS_INDEX_ONLY_FIELDS = [
  {
    id: 'orders.order_date',
    family: 'orders',
    // Placed, else Imported when the channel gave no placed date.
    label: ORDER_DATE_LABEL.placed,
    displayType: 'date',
    slotKinds: ['status'],
    paths: { at: 'order_date|created_at' },
  },
  {
    id: 'orders.customer',
    family: 'orders',
    label: 'Customer',
    displayType: 'text',
    slotKinds: ['status'],
    paths: { name: 'customer|shipstation_ship_to' },
  },
  {
    id: 'orders.channel',
    family: 'orders',
    label: 'Platform',
    displayType: 'tag',
    slotKinds: ['status'],
    paths: { value: 'account_source', fba: 'fulfillment_channel' },
  },
  {
    id: 'orders.total',
    family: 'orders',
    label: 'Total',
    displayType: 'money',
    slotKinds: ['status'],
    paths: { value: 'sale_amount|price_cents', currency: 'currency|price_currency' },
  },
  {
    id: 'orders.fulfillment',
    family: 'orders',
    label: 'Fulfillment',
    displayType: 'tag',
    slotKinds: ['status'],
    paths: { packed: 'packed_at', shipped: 'ship_confirmed_at', held: 'is_out_of_stock|row_flag' },
  },
  {
    id: 'orders.fulfill_by',
    family: 'orders',
    label: 'Fulfill by',
    displayType: 'date',
    slotKinds: ['status'],
    paths: { at: 'deadline_at|ship_by_date' },
  },
  {
    id: 'orders.items',
    family: 'orders',
    label: 'Items',
    displayType: 'number',
    slotKinds: ['status'],
    paths: { value: 'quantity' },
  },
  {
    // Carrier only until a structured delivery service lands (research P4).
    id: 'orders.delivery',
    family: 'orders',
    label: 'Delivery',
    displayType: 'text',
    slotKinds: ['status'],
    paths: { carrier: 'carrier', tracking: 'shipping_tracking_number' },
  },
  {
    // Derived chips only (owner D6): urgent, hold / shortage reason, row flag, condition.
    id: 'orders.tags',
    family: 'orders',
    label: 'Tags',
    displayType: 'tag',
    slotKinds: ['status'],
    paths: { flag: 'row_flag', condition: 'condition', urgent: 'is_urgent' },
  },
  {
    id: 'orders.bin',
    family: 'orders',
    label: 'Bin',
    displayType: 'text',
    slotKinds: ['status'],
    paths: { bins: 'storage_locations' },
  },
] as const satisfies FieldCatalog;

/**
 * The INDEX face's catalog: the order handle, the order-level facts, then the
 * warehouse steps (Bin · Pick · Pack) — offered in the Fields picker, unbound by
 * default. No line facts (qty, price, condition, item #, notes): they belong to
 * the line rows of the record, not the order list.
 */
export const ORDERS_INDEX_FIELD_CATALOG: FieldCatalog = [
  ...ORDERS_FIELD_CATALOG.filter((f) => f.id === 'orders.order_id'),
  ...ORDERS_INDEX_ONLY_FIELDS,
  ...ORDERS_FIELD_CATALOG.filter((f) => f.id === 'orders.picked' || f.id === 'orders.packed'),
];

/**
 * The PRODUCT default of the To-ship index face — Shopify's Unfulfilled view,
 * minus Payment (owner D4: every To-ship order is paid by construction).
 * Order is the locked identity track, so it is always first.
 */
export const ORDERS_INDEX_LAYOUT: DataTableColumnLayout = {
  morph: 'sheet',
  identityFieldId: 'orders.order_id',
  statusBindings: [
    { fieldId: 'orders.order_date' },
    { fieldId: 'orders.customer' },
    { fieldId: 'orders.channel' },
    { fieldId: 'orders.total' },
    { fieldId: 'orders.fulfillment' },
    { fieldId: 'orders.fulfill_by' },
    { fieldId: 'orders.items' },
    { fieldId: 'orders.delivery' },
    { fieldId: 'orders.tags' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
}

/**
 * The index face's OWN layout document, over its own catalog. Not `orders`:
 * that document is the compound LINE layout (orgs have stored copies binding
 * Pick · Pack · Scanned out plus five under-title facts), and its catalog
 * carries `orders.qty` / `orders.amount`, which the cascade pins into every
 * layout as columns. Neither may bleed into the order list — the staging /
 * per-SKU-allocations precedent of one entity, two documents.
 */
export const ORDERS_INDEX_TABLE_LAYOUT_ID = 'orders-index';

/** Every orders fact id a view spec may name — line and index facts. */
export type OrdersFactId =
  | (typeof ORDERS_FIELD_CATALOG)[number]['id']
  | (typeof ORDERS_INDEX_ONLY_FIELDS)[number]['id'];

/** Runtime twin of {@link OrdersFactId} — the registry a spec's facts must resolve in. */
export const ORDERS_FACT_IDS: ReadonlySet<string> = new Set(
  [...ORDERS_FIELD_CATALOG, ...ORDERS_INDEX_ONLY_FIELDS].map((f) => f.id),
);
