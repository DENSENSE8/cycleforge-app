/**
 * Admin drift-alert field catalog — the bindable facts of ONE open `stock_alerts`
 * DRIFT row.
 *
 * Off `AdminTable` 2026-09-12 (Wave D). The retired desk
 * (`_inventory-admin/TableSections.tsx`, `DRIFT_ALERT_COLUMNS`) painted FOUR
 * hand-written `AdminTableColumn` objects carrying JSX — a second table
 * engine's column type, with no header sort, no Fields picker, no search and
 * no org binding, because that engine never grew them.
 *
 * ## Where the four facts landed
 *
 * | retired cell | fact           | home on the compound row              |
 * |--------------|----------------|---------------------------------------|
 * | SKU          | `sku`          | the IDENTITY handle (`fulfillment`)   |
 * | Worst \|Δ\|  | `worst_delta`  | the STATE pill                        |
 * | Triggered    | `triggered`    | DATES chrome (day over clock)         |
 * | Detail       | `detail`       | the row TITLE (item cell)             |
 *
 * Three of those four placements are decisions rather than transcription, so
 * each is stated:
 *
 * **`worst_delta` is this desk's STATE.** The retired cell painted it bold red
 * — the row's one attention fact, and the number an operator triages a page of
 * alerts by. A compound row says "where is this row AT" in the state pill, and
 * for an open drift alert the answer is *how far out of sync* — there is no
 * lifecycle word, because the query pins `resolved_at IS NULL`, so a pill
 * saying "Open" would print the same constant on every row and its header
 * would sort nothing. The pill carries the magnitude and its header sorts that
 * fact. Tone (alert vs neutral) is never the fact; the pill's word is.
 *
 * **`detail` is the TITLE, not a note line.** It is the cron's own prose
 * (`drift: warehouse stored=3 ledger=5 (Δ=-2) ; boxed …`) and it is the only
 * fact on the row that says WHAT HAPPENED. The item track is the widest in the
 * skeleton (18rem, resizable) and the title line is where a reader looks for
 * the event; the retired cell's muted mono styling was paint, not fact. A
 * subtitle would need a title above it and this row has no other name.
 *
 * **`sku` is the identity, not the title.** It is the row's handle — the string
 * an operator pastes into a SKU query — and it is the only `id` fact here,
 * which is what `parseSlotLayout` requires of an identity binding. The retired
 * cell's `<a href="/inventory/health/sku/…">` becomes the row's `navigate`
 * record plane instead of a link inside a cell.
 *
 * ## Not here, and deliberately
 *
 * The alert's own `id` is the row KEY and was painted by nothing — no catalog
 * entry. `alert_type`, `resolved_at`, `threshold`, `bin_id` and `notified_at`
 * are columns `stock_alerts` has that this desk never selects (see
 * `@/lib/inventory/drift-rows`). `admin-drift-alerts.test.ts` fails the day one
 * of those names appears in a `paths` here.
 *
 * Resolution is `./admin-drift-alerts-resolve.ts`, kept separate so this
 * module stays a LEAF.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const ADMIN_DRIFT_ALERTS_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'admin-drift-alerts.sku',
    family: 'admin-drift-alerts',
    label: 'SKU',
    displayType: 'id',
    slotKinds: ['identity', 'status', 'subtitle'],
    paths: { value: 'sku' },
  },
  {
    id: 'admin-drift-alerts.worst_delta',
    family: 'admin-drift-alerts',
    label: 'Worst |Δ|',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'qty_at_trigger' },
  },
  {
    id: 'admin-drift-alerts.triggered',
    family: 'admin-drift-alerts',
    label: 'Triggered',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'triggered_at' },
  },
  {
    id: 'admin-drift-alerts.detail',
    family: 'admin-drift-alerts',
    label: 'Detail',
    displayType: 'note',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'notes' },
  },
];

/**
 * The PRODUCT default: every fact on the shared row CHROME, and NO bound track.
 *
 * The skeleton mounts WHOLE (no geometry cut — `COMPOUND_SKELETON_FILTER_DEBT`
 * is documented shrink-only), so `select · fulfillment · thumb · item · dates ·
 * state · _fill` is SIX default-visible tracks against
 * `MAX_DEFAULT_VISIBLE_TRACKS` (10) and FOUR status slots are free. This desk
 * binds none of them, because all four of its facts are already painted by
 * chrome the skeleton mounts anyway:
 *
 * - `sku` — the identity chip (`identityFieldId`).
 * - `detail` — the item cell's title line.
 * - `triggered` — the DATES chrome. Hash line = the civil day, Calendar line =
 *   the clock face; the retired cell printed `toLocaleString()` and an alert
 *   whose trigger time is rounded to the day has lost the fact it exists to
 *   record.
 * - `worst_delta` — the state pill (adapter chrome).
 *
 * A bound track beside any of those would print the same fact twice on one row
 * ("a due date on both lines is a lie by repetition", `compound-row-model.ts`).
 * All four stay catalog FACTS, so every painted header sorts, and a staffer who
 * wants `worst_delta` or `triggered` as an explicit column has four free slots
 * to bind it into — the house form of the retired `tier: 'optional'` (see
 * `ready.ts`, `repair.ts`, `my-day.ts`).
 *
 * `amountFieldId: null` — a stock alert has no money fact.
 */
export const ADMIN_DRIFT_ALERTS_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'admin-drift-alerts.sku',
  statusBindings: [],
  subtitleBindings: [],
  amountFieldId: null,
};

/** The one tableId this catalog serves — `PRODUCT_TABLES`' drift-alerts entry. */
export const ADMIN_DRIFT_ALERTS_TABLE_LAYOUT_ID = 'admin-drift-alerts';
