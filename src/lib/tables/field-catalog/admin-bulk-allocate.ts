/**
 * Bulk-allocate field catalog — the bindable facts of ONE allocation
 * candidate (an unallocated `orders` row beside its SKU's STOCKED count).
 *
 * Off `AdminTable` 2026-09-12 (Wave D). The retired desk painted SEVEN
 * hand-written `AdminTableColumn` objects carrying JSX — a `<Link>`, a
 * tri-coloured `<span>`, and a `<form>` wrapping a `<Button>` in a
 * `HoverTooltip` — with no header sort, no Fields picker and no org binding,
 * because that engine never grew them.
 *
 * ## Where the seven cells landed
 *
 * | retired cell        | fact                | home on the compound row        |
 * |---------------------|---------------------|---------------------------------|
 * | Order id            | `order_id`          | the IDENTITY chip (chrome)      |
 * | Ext id              | `ext_id`            | `status:1`                      |
 * | SKU (a `<Link>`)    | `sku`               | the row TITLE + `navigate` plane|
 * | Condition           | `condition`         | bound SUBTITLE                  |
 * | Qty                 | `qty`               | line-qty SUBTITLE (pinned)      |
 * | Available STOCKED   | `available_stocked` | `status:2`                      |
 * | Action (a `<form>`) | — (verb)            | the Allocate ROW VERB           |
 *
 * Four of those are decisions rather than transcription:
 *
 * **The tri-colour became a WORD.** The availability cell painted green /
 * amber / red against the derived `eligible` flag. Tone is never the fact, so
 * eligibility is now `eligible`, a closed three-word vocabulary
 * (`Ready` · `Short` · `No stock`) on the STATE pill, with the shortfall
 * sentence on its hover. The NUMBER keeps its own bound track beside it, in
 * plain ink.
 *
 * **`qty` and `eligible` have no `paths`.** Neither is a column: `qty` is the
 * page's floor-clamped parse of the TEXT column `orders.quantity`, and
 * `eligible` is `available_stocked >= qty`. Both resolve through
 * `@/lib/inventory/allocation-candidate-row`. A `paths` entry naming
 * `quantity_str` would claim the raw string IS the fact, which is what the
 * retired page already knew it was not.
 *
 * **The SKU is the title, not a link cell.** A candidate row has no product
 * title — the SKU is what the thing IS on this desk, so it is the item cell's
 * bold line, and the retired cell's reach-through to
 * `/inventory/health/sku/<sku>` is the binding's `navigate` record plane.
 *
 * **`ordered` is new, and it is here because the skeleton mounts DATES.** The
 * retired query selected no timestamp at all. Mounting the shared compound
 * skeleton whole (`COMPOUND_SKELETON_FILTER_DEBT` is shrink-only) means the
 * DATES track paints, and a painted track with no fact behind it is both a
 * dead header (`SLOT_TABLE_PAINT_LAW.headerSort`) and a permanent `--`
 * (`SLOT_TABLE_PAINT_LAW.dates`). So the port added `orders.order_date` and
 * `orders.created_at` to the candidate query, under the `ordersOrderedAt`
 * rule: the channel's purchase instant, falling back to the insert stamp,
 * with the tooltip naming which one is on screen. It is also the fact the desk
 * was missing — how long an order has waited for units.
 *
 * ## Not here, and deliberately
 *
 * `quantity_str` is never a fact on its own (see above), and the desk's
 * `total` count is a page aggregate, not a row fact. Nothing else the
 * candidate query reads goes unpainted.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const ADMIN_BULK_ALLOCATE_FIELD_CATALOG: FieldCatalog = [
  { id: 'admin-bulk-allocate.order_id', family: 'admin-bulk-allocate', label: 'Order id', displayType: 'id', slotKinds: ['identity', 'status', 'subtitle'], paths: { value: 'order_id' } },
  { id: 'admin-bulk-allocate.ext_id', family: 'admin-bulk-allocate', label: 'Ext id', displayType: 'id', slotKinds: ['status', 'subtitle'], paths: { value: 'order_id_text' } },
  { id: 'admin-bulk-allocate.sku', family: 'admin-bulk-allocate', label: 'SKU', displayType: 'id', slotKinds: ['identity', 'status', 'subtitle'], paths: { value: 'sku' } },
  { id: 'admin-bulk-allocate.condition', family: 'admin-bulk-allocate', label: 'Condition', displayType: 'tag', slotKinds: ['status', 'subtitle'], paths: { value: 'condition' } },
  // DERIVED — no `paths`. The page's floor-clamped parse of the TEXT column
  // `orders.quantity`; `.qty` + number + subtitle is what pins it under the
  // title as line-qty identity (`ensureLineQtySubtitle`).
  { id: 'admin-bulk-allocate.qty', family: 'admin-bulk-allocate', label: 'Qty', displayType: 'number', slotKinds: ['status', 'subtitle'] },
  { id: 'admin-bulk-allocate.available_stocked', family: 'admin-bulk-allocate', label: 'Available STOCKED', displayType: 'number', slotKinds: ['status', 'subtitle'], paths: { value: 'available_stocked' } },
  // DERIVED — no `paths`. `available_stocked >= qty`, as the pill's word.
  { id: 'admin-bulk-allocate.eligible', family: 'admin-bulk-allocate', label: 'Allocatable', displayType: 'tag', slotKinds: ['status', 'subtitle'] },
  { id: 'admin-bulk-allocate.ordered', family: 'admin-bulk-allocate', label: 'Ordered', displayType: 'date', slotKinds: ['status', 'subtitle'], paths: { value: 'order_date', fallback: 'created_at' } },
];

/**
 * The PRODUCT default: the EXTERNAL handle and the AVAILABILITY count as the
 * two tracks.
 *
 * The skeleton mounts WHOLE (no geometry cut), so `fulfillment · thumb · item ·
 * dates · state · status:N · _fill` leaves FOUR status slots under
 * `MAX_DEFAULT_VISIBLE_TRACKS`. This desk needs two of them, because five of
 * the eight facts are painted by chrome the skeleton already mounts:
 *
 * - `order_id` — the IDENTITY chip (`identityFieldId`). One identity per row.
 * - `sku` — the item cell's TITLE. A track repeating the title is noise.
 * - `eligible` — the STATE pill (adapter chrome).
 * - `ordered` — the DATES chrome. Hash line = the civil day, Calendar line =
 *   how long the order has waited. A bound track beside it would print the
 *   same instant twice.
 * - `condition` / `qty` — the item cell's SUBTITLE line, `qty · condition`.
 *   Never a second track for a cell's second line, and `qty` cannot leave that
 *   place anyway (`LINE_QTY_LOCKED_REASON`).
 *
 * The two that DO get tracks are the two an operator reads across rows rather
 * than within one: the external order number they are matching against a
 * channel, and the STOCKED count that decides whether the verb is live. Those
 * are the scan-critical facts on this desk.
 *
 * All five chrome-painted facts stay catalog FACTS, so their headers sort and
 * the search box matches them, and a staffer who wants `condition` or
 * `ordered` as an explicit column has two free slots to bind it into — the
 * house form of the retired `tier: 'optional'` (see `ready.ts`, `repair.ts`,
 * `my-day.ts`).
 *
 * `amountFieldId: null` — a candidate row carries no money fact. The retired
 * desk never selected a price and this port does not invent one.
 */
export const ADMIN_BULK_ALLOCATE_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'admin-bulk-allocate.order_id',
  statusBindings: [
    { fieldId: 'admin-bulk-allocate.ext_id' },
    { fieldId: 'admin-bulk-allocate.available_stocked' },
  ],
  subtitleBindings: [
    { fieldId: 'admin-bulk-allocate.qty' },
    { fieldId: 'admin-bulk-allocate.condition' },
  ],
  amountFieldId: null,
};

export const ADMIN_BULK_ALLOCATE_TABLE_LAYOUT_ID = 'admin-bulk-allocate';
