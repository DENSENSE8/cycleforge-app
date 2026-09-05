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
 * ## What is refused, and why  `wave 6 · 2026-09-02`
 *
 * The method was to MEASURE: count each candidate column in both live order
 * readers before naming it. The plan's own constraint is that *"a fact added to
 * one does not reach the others"* — a one-reader fact is present on one lane
 * and blank on another, silently.
 *
 * **The comment naming THREE readers is stale.** `getActiveOrders` no longer
 * exists anywhere in `src`; there are two (`/api/orders/route.ts` and
 * `lib/neon/orders-queries.ts`). Same class of error as the `useIsColumnHidden`
 * justification wave 1.3 found.
 *
 * Refused because they reach ONE reader only. Each is a query change, not
 * binding work — the fix is named so the next porter does not re-derive it:
 *
 * - **`catalog_image_url`** — the photo the compound thumbnail track has been
 *   faking. `orders-queries.ts` never joins `sku_catalog`, so it is absent on
 *   every shipped lane. Fix: add the join (and its GROUP BY entry) to that
 *   reader's aggregate, then bind. Deliberately NOT smuggled into a binding
 *   wave — it changes a hot query.
 * - **`catalog_category`**, **`pack_location_name`**, **`has_tech_scan`**,
 *   **`customer_id`**, **`label_printed_at`**, **`tracking_added_at`** — same
 *   shape, same reason.
 *
 * Refused for reasons other than coverage:
 *
 * - **`currency`** — it is not a column, it is part of how `orders.amount`
 *   PRINTS. A currency track beside a money track is two halves of one fact in
 *   two places.
 * - **Lateness / age-in-days** — clock-derived. The surface owns `nowMs` and
 *   computes it once for every row; a field would recompute per cell and
 *   disagree with the header. Same refusal `tasks` and `incoming` carry.
 * - **Fees · cost · margin · service level** — absent from the schema, not from
 *   the catalog. An ingestion project (open question 1), and the nearest cost
 *   fact lives on `sku_catalog` and is never selected.
 * - **Buyer identity / destination** — open question 2, and the only handle
 *   either reader carries (`customer_id`) is one-sided anyway.
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
    id: 'orders.coverage',
    family: 'orders',
    label: 'Coverage',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'shortage_coverage' },
  },
  {
    // Also a SUBTITLE fact since 2026-09-04: the desk prints the money under
    // the title, between condition and the note, rather than in a track of its
    // own. Line money is engine identity (`ensureLineMoneySubtitle`) — every
    // family that catalogs `.amount` / `.price` inherits the same place.
    id: 'orders.amount',
    family: 'orders',
    label: 'Amount',
    displayType: 'money',
    slotKinds: ['subtitle'],
    paths: { value: 'sale_amount' },
  },
  // ── Wave 6 · the seller facts the feed already returns ───────────────────
  //
  // Every entry below was MEASURED, not guessed: each column was counted in
  // BOTH live order readers (`/api/orders/route.ts` and
  // `lib/neon/orders-queries.ts`) before it was named here. A fact that reaches
  // only one reader is present on one lane and blank on another, with no error
  // — see the refusals in this file's docblock.
  {
    // The stock handle, distinct from `item_number` (the LISTING handle). An
    // operator reprices by SKU and answers a buyer by item number; the two are
    // different questions and the flat model only ever offered one.
    id: 'orders.sku',
    family: 'orders',
    label: 'SKU',
    displayType: 'id',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'sku' },
  },
  {
    id: 'orders.tracking',
    family: 'orders',
    label: 'Tracking',
    displayType: 'tracking',
    slotKinds: ['status', 'subtitle'],
    // Tracking rides the IDENTITY field's paths too, where it is the second
    // line of the order cell. This binding is for an org that wants it as its
    // own track — same fact, a different place to read it.
    paths: { value: 'tracking_number|shipping_tracking_number' },
  },
  {
    id: 'orders.carrier',
    family: 'orders',
    label: 'Carrier',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'carrier' },
  },
  {
    // The carrier's own answer, not ours. `latest_status_label` is the human
    // string the carrier returned; the code and category ride along for tone.
    id: 'orders.delivery_status',
    family: 'orders',
    label: 'Delivery',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: {
      value: 'latest_status_label',
      code: 'latest_status_code',
      category: 'latest_status_category',
    },
  },
  {
    id: 'orders.delivery_event',
    family: 'orders',
    label: 'Last scan',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'latest_event_at' },
  },
  {
    // A boolean the operator triages on — an exception is the row that needs a
    // human. Kept separate from `delivery_status` because a delivered parcel
    // can still carry an exception in its history, and folding them would let
    // the good news hide the bad.
    id: 'orders.exception',
    family: 'orders',
    label: 'Exception',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'has_exception', at: 'exception_at' },
  },
  {
    id: 'orders.platform',
    family: 'orders',
    label: 'Platform',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'account_source' },
  },
  {
    id: 'orders.flag',
    family: 'orders',
    label: 'Flag',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'row_flag' },
  },
  {
    // HOW MANY ops notes, which is a different question from what the latest
    // one says (`orders.notes`). A packer scanning a queue wants to know a row
    // has been discussed without reading the discussion.
    id: 'orders.note_count',
    family: 'orders',
    label: 'Notes #',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'note_count' },
  },
  {
    id: 'orders.urgent',
    family: 'orders',
    label: 'Urgent',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'is_urgent' },
  },
  {
    // The binary. `orders.coverage` is the richer shortage answer and stays the
    // one to bind when an org wants detail; this is for a lane that only needs
    // "can I pick it".
    id: 'orders.stock',
    family: 'orders',
    label: 'Stock',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'is_out_of_stock' },
  },
  {
    id: 'orders.serial',
    family: 'orders',
    label: 'Serial',
    displayType: 'id',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'serial_number' },
  },
  {
    // WHEN the order arrived. Lateness against a ship-by is computed by the
    // surface from its shared `nowMs` and is deliberately NOT a field — the
    // same refusal `tasks` and `incoming` already carry.
    id: 'orders.age',
    family: 'orders',
    label: 'Received',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'created_at' },
  },
];

/**
 * The PRODUCT default To-ship layout: the pick step in status:1, and
 * `qty · condition · notes` under the title (operator lock 2026-08-30, in
 * that order) — an org with no override sees the secondary line without
 * binding anything. Packed stays in the catalog for an org to bind. Scanned
 * out is catalog-bindable but {@link omitShippedOnlyBindings} keeps it off
 * working-queue paints. The money is a SUBTITLE binding (operator 2026-09-04),
 * not `amountFieldId`: the Amount column was dropped from the Orders mount and
 * the figure moved under the title between the condition and the note, so the
 * amount SLOT is empty here and binding it in both places would be a duplicate
 * `parseSlotLayout` refuses.
 * Guard: `orders.test.ts` parses this against the catalog.
 */
export const ORDERS_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'orders.order_id',
  statusBindings: [{ fieldId: 'orders.picked' }],
  // Under the title, in scan order (operator ruling 2026-08-31): how many, what
  // grade, which item, then whatever the last operator said about it. The item
  // number joined on that ruling — it is the number a packer reads off the shelf
  // label, and it was a catalog field no default ever bound.
  subtitleBindings: [
    // QTY then PRICE, adjacent — the line-item pair every receipt, cart and
    // order admin prints together (`1 × $49.99`). They are one commercial
    // fact read in one movement: how many, for how much. The grade is a
    // PRODUCT attribute and follows them; the note is last because it is the
    // only variable-length part. (Operator 2026-09-04, moving the price left
    // of the condition after it first landed to the right of it.)
    { fieldId: 'orders.qty' },
    { fieldId: 'orders.amount' },
    { fieldId: 'orders.condition' },
    { fieldId: 'orders.item_number' },
    { fieldId: 'orders.notes' },
  ],
  // NULL since 2026-09-04: `orders.amount` is bound as a SUBTITLE above, and a
  // field may not be bound twice (`parseSlotLayout` refuses duplicates — as it
  // should: two slots resolving the same fact is how a grid ends up printing it
  // twice). The Orders mount has no amount TRACK to fill either; the money
  // lives under the title now.
  amountFieldId: null,
};

/**
 * Status facts that belong on the Shipped lane only. A dock scan-out is not a
 * To-ship / Packed / Labels column — those desks are in-building work.
 */
export const SHIPPED_LANE_STATUS_FIELDS = ['orders.scanned_out'] as const;

/** Shortage-only coverage face — To-ship / Packed / Labels / Shipped omit it. */
export const SHORTAGE_LANE_STATUS_FIELDS = ['orders.coverage'] as const;

/** Drop Shipped-only bindings so a working-queue layout cannot paint them. */
export function omitShippedOnlyBindings(layout: SlotLayout): SlotLayout {
  const drop = new Set<string>(SHIPPED_LANE_STATUS_FIELDS);
  const statusBindings = layout.statusBindings.filter((b) => !drop.has(b.fieldId));
  if (statusBindings.length === layout.statusBindings.length) return layout;
  return { ...layout, statusBindings };
}

/** Drop coverage so To-ship cannot paint a Shortage-only fact. */
export function omitShortageCoverageBindings(layout: SlotLayout): SlotLayout {
  const drop = new Set<string>(SHORTAGE_LANE_STATUS_FIELDS);
  const statusBindings = layout.statusBindings.filter((b) => !drop.has(b.fieldId));
  const subtitleBindings = layout.subtitleBindings.filter((b) => !drop.has(b.fieldId));
  if (
    statusBindings.length === layout.statusBindings.length &&
    subtitleBindings.length === layout.subtitleBindings.length
  ) {
    return layout;
  }
  return { ...layout, statusBindings, subtitleBindings };
}

/** Shortage desk always paints Coverage, even when the org layout omitted it. */
export function ensureShortageCoverageBinding(layout: SlotLayout): SlotLayout {
  const hasStatus = layout.statusBindings.some((b) => b.fieldId === 'orders.coverage');
  const hasSubtitle = layout.subtitleBindings.some((b) => b.fieldId === 'orders.coverage');
  if (hasStatus || hasSubtitle) return layout;
  return {
    ...layout,
    statusBindings: [...layout.statusBindings, { fieldId: 'orders.coverage' }],
  };
}

/** The one tableId this catalog serves — `PRODUCT_TABLES`' To-ship entry. */
export const ORDERS_TABLE_LAYOUT_ID = 'orders';
