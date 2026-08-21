/**
 * Unbox / History / Testing spreadsheet column model — SoT for receiving-line
 * LedgerGrid surfaces that are not Incoming POS.
 *
 * Same spreadsheet family as Pending / Incoming (Date as a per-row column —
 * no sticky day-band headers on these rails):
 *   select · order · title · status · date · qty · price · cond · location · tracking · serial · _fill
 *
 * Frozen identity pane: `select · order` (PO stays pinned while Product / Date /
 * facts h-scroll). Incoming keeps its own Expected / Age / Status columns
 * ({@link INCOMING_GRID_COLUMNS}, co-located below — a separate array, never
 * filtered into {@link RECEIVING_GRID_COLUMNS}). The activity-axis stamp (Unboxed / Scanned /
 * Tested) renders as `date` (civil day; full stamp on hover) and its stage NAME
 * as `status`; there is no separate `stage` track. Location is triage shelf
 * placement (`staging_location_label`).
 *
 * Product is a hard preferred track (Sheets-exact drag-resize). Trailing
 * `_fill` owns the sole `1fr` slack — same law as Orders.
 */

import { GRID_FILL_COLUMN } from '@/design-system/components/grid';
import { gridFrozenKeys } from '@/design-system/components/grid/grid-column-editability';
import {
  gridColumnTrackRem,
  gridContentMinWidthRem,
  gridFrozenLeft,
  gridHeaderShowsLabel,
  gridTemplate,
} from '@/design-system/components/grid/grid-column-geometry';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import {
  isCustomFieldColumnKey,
  type CustomFieldColumnKey,
} from '@/lib/tables/custom-field-keys';
import { SHARED_LINE_TRACK_META } from '@/lib/receiving/shared-line-tracks';

export type ReceivingGridColumnKey =
  | 'select'
  | 'title'
  | 'status'
  | 'date'
  | 'qty'
  | 'price'
  | 'condition'
  | 'location'
  | 'order'
  | 'tracking'
  | 'serial'
  | 'zoho'
  /** Compound (two-row) presentation tracks — see {@link RECEIVING_COMPOUND_COLUMNS}. */
  | 'thumb'
  | 'item'
  | 'fulfillment'
  | 'state'
  | 'open'
  | '_fill'
  /** Org-defined custom columns (`custom:<defKey>`). */
  | CustomFieldColumnKey;

/**
 * EXTENDS the house model — it does not re-declare it. Every shared field
 * (`width` · `label` · `gridLabel` · `labelFitRem` · `type` · `align` ·
 * `omitCellIcon` · `hideKey` · `tier`) is inherited, so a new presentation
 * field lands once on `LedgerGridColumnModel` instead of being re-typed in
 * each of the five surface layouts. Only `key` narrows, plus genuinely
 * receiving-specific fields.
 */
export interface ReceivingGridColumn extends Omit<LedgerGridColumnModel, 'key'> {
  key: ReceivingGridColumnKey;
  /** When false, header is not click-to-sort (select gutter only). Default true for data cols. */
  sortable?: boolean;
}

/**
 * Canonical Unbox / History / Testing columns.
 *
 * Deterministic fact tracks stay content-hard `minmax(X,X)` + `resizable: false`
 * (Order · Date · Qty · Price · Loc · Tracking …). **Product and Status are
 * drag-resizable** (2026-08-06): Product is a hard preferred track
 * (`minmax(16rem, 16rem)` + `resizable: true`, clamped 8rem…720px); trailing
 * `_fill` (`minmax(0rem, 1fr)`) absorbs leftover sheet width so Product drag is
 * Sheets-visible. Status keeps its content-hard `minmax(6rem, 6rem)` floor but
 * exposes a grip so operators widen it for long stage names — the
 * `--cf-col-status` drag override rides the same generic `gridTemplate` var as
 * Product. Spreadsheet zoom scales rem floors via `--cf-density`.
 *
 * Frozen identity pane (2026-08-05): `select · order`. The PO is the unique
 * alphanumeric row handle — pinned while Product / Status / Date / facts
 * h-scroll. Contiguous-prefix rule as every other LedgerGrid family.
 * Operator-editable freeze panes (pin any column) remain future work.
 *
 * ## Default (`core`) set
 *
 * A receiving line is scanned by: which PO (`order`), what is it (`title`),
 * what state (`status`), when it reached its stage (`date`), how many (`qty`),
 * what it cost (`price` — Zoho line rate), where triage placed it (`location`),
 * and the other identifier an operator scans (`tracking`). That is the whole
 * default grid.
 *
 * `condition` and `serial` stay `optional` — they are usually empty at the
 * moment the row is being scanned (set during unbox). A column that is blank
 * for most rows costs horizontal budget and scan attention for nothing. Staff
 * who work a lane where they matter turn them on once, and it follows them
 * across devices.
 */
export const RECEIVING_GRID_COLUMNS: readonly ReceivingGridColumn[] = [
  // Frozen identity pane: select gutter + PO. Contiguous prefix —
  // `gridFrozenLeft` sums widths of frozen columns before each cell.
  { key: 'select', width: 'minmax(2rem, 2rem)', sortable: false, frozen: true, resizable: false },
  // PO number — sticky identity (no hideKey / tier). Trailing frozen edge owns
  // the scroll shadow (`data-frozen-edge`).
  //
  // `align: 'start'` — text/ID law (explicit; `type: 'id'` already starts).
  {
    key: 'order',
    width: 'minmax(5.5rem, 5.5rem)',
    ...SHARED_LINE_TRACK_META.order,
    frozen: true,
    // Dense Sheets face: the header already says ORDER, so the body carries the
    // platform brand DOT and no `#` glyph. This was previously a bare `plain`
    // hardcoded in `ReceivingOrderCell`; declaring it here is what lets the
    // Orders/To-Ship grid answer the same question from the same field.
    omitCellIcon: true,
    resizable: false,
    labelFitRem: 4.5,
  },
  // Fixed preferred track — NOT `1fr`. A fill track made Product drag-resize a
  // floor-only change while `1fr` kept stretching to the card (narrower = no
  // visible move). Content-sized so resize is Sheets-exact; leftover sheet
  // width is absorbed by trailing `_fill`.
  {
    key: 'title',
    width: 'minmax(16rem, 16rem)',
    ...SHARED_LINE_TRACK_META.title,
    gridLabel: 'Product',
    resizable: true,
    minTrackRem: 8,
    labelFitRem: 8,
  },
  // The row's lifecycle STATE — dot · stage name (`ReceivingStatusCell`).
  // Drag-resizable (2026-08-06): content-hard 6rem floor, widened via
  // `--cf-col-status` for long stage names.
  { key: 'status', width: 'minmax(6rem, 6rem)', ...SHARED_LINE_TRACK_META.status, hideKey: 'status', resizable: true, labelFitRem: 4.5 },
  // WHEN it reached that stage — civil day floor (`MIN_TRACK_REM_BY_DATE_FACE.day`).
  // Full day + time stays on the cell tooltip. Scrolls with facts (not identity).
  // Sits AFTER Product/Status so the day stamp is not jammed against the title.
  {
    key: 'date',
    width: 'minmax(4.5rem, 4.5rem)',
    label: 'Date',
    gridLabel: 'Date',
    type: 'date',
    dateFace: 'day',
    align: 'end',
    resizable: false,
    labelFitRem: 4.5,
  },
  // Qty — magnitude → end + tabular-nums.
  { key: 'qty', width: 'minmax(4.5rem, 4.5rem)', ...SHARED_LINE_TRACK_META.qty, hideKey: 'qty', resizable: false, labelFitRem: 3.5 },
  // Zoho PO line unit cost — magnitude → end. Header owns the Receipt glyph;
  // dense Sheets face keeps the cell mark omitted (`omitCellIcon`).
  { key: 'price', width: 'minmax(5.5rem, 5.5rem)', label: 'Price', type: 'price', align: 'end', omitCellIcon: true, hideKey: 'price', resizable: false, labelFitRem: 4.5 },
  { key: 'condition', width: 'minmax(5.5rem, 5.5rem)', ...SHARED_LINE_TRACK_META.condition, hideKey: 'condition', tier: 'optional', resizable: false, labelFitRem: 4.5 },
  {
    key: 'location',
    width: 'minmax(6.5rem, 6.5rem)',
    label: 'Location',
    gridLabel: 'Loc',
    type: 'location',
    align: 'start',
    hideKey: 'stagingloc',
    resizable: false,
    labelFitRem: 4.5,
  },
  // Carrier # — ID/label → start. Header owns the TRACK glyph (Incoming quiet).
  {
    key: 'tracking',
    width: 'minmax(8rem, 8rem)',
    ...SHARED_LINE_TRACK_META.tracking,
    omitCellIcon: true,
    hideKey: 'tracking',
    resizable: false,
    labelFitRem: 4.5,
  },
  { key: 'serial', width: 'minmax(8rem, 8rem)', label: 'Serial', type: 'id', align: 'start', hideKey: 'serial', tier: 'optional', resizable: false, omitCellIcon: true, labelFitRem: 4.5 },
  { key: 'zoho', width: 'minmax(5.5rem, 5.5rem)', ...SHARED_LINE_TRACK_META.zoho, hideKey: 'zoho', tier: 'optional', resizable: false, labelFitRem: 4.5 },
  // Trailing filler — geometry only. Absorbs zoom-out / wide-card slack so fact
  // tracks stay content-hard. No label, type, hideKey, or tier: never in Column
  // display; Column discovery stays triage ▦ / header menus.
  GRID_FILL_COLUMN,
] as const;

/**
 * COMPOUND (two-row) Unbox / History columns — the high-density WMS layout.
 *
 * A **sibling array, never a filter of {@link RECEIVING_GRID_COLUMNS}** — the
 * same rule `INCOMING_GRID_COLUMNS` follows above. The two models answer
 * different questions: the flat one is a spreadsheet (one fact per track, each
 * independently sortable), this one is a scan list (four compound cells, each
 * pairing an identifier with its qualifier).
 *
 * **The engine is unchanged.** This is only a column model: `LedgerGridSurface`
 * still owns width, freeze, resize, per-staff visibility and virtualization,
 * and `ReceivingGridRow` still dispatches per key. Swapping presentation is
 * therefore a `columns` prop, not a second table component — which is why the
 * compound layout costs one array and four cell bodies instead of a fork.
 *
 * Track budget, and why each is content-hard:
 *
 * | track         | width  | carries                                   |
 * |---------------|--------|-------------------------------------------|
 * | `select`      | 2rem   | frozen checkbox gutter (shared)           |
 * | `thumb`       | 4rem   | square photo; sized for the LARGEST thumb |
 * | `item`        | 18rem  | title / sku · code — the only resizable   |
 * | `fulfillment` | 11rem  | PO / carrier + tracking                   |
 * | `state`       | 10rem  | stage pill / stamp · operator             |
 * | `open`        | 2.5rem | chevron → right rail                      |
 *
 * `thumb` is a FIXED 4rem across all three densities on purpose: a track that
 * resized with the density toggle would reflow every frozen offset
 * (`gridFrozenLeft` sums preceding frozen widths) on a control that is supposed
 * to change only row height. The image scales inside a stable track instead.
 *
 * Frozen identity pane is `select · thumb` — contiguous-prefix, same law as the
 * flat model. The thumbnail is the row handle here the way the PO is there.
 */
export const RECEIVING_COMPOUND_COLUMNS: readonly ReceivingGridColumn[] = [
  // HARD RULE — column order is image · ids · title · status. Frozen prefix is
  // `select · thumb`: the photo is the row handle an operator scans for, so it
  // stays pinned while everything else h-scrolls.
  { key: 'select', width: 'minmax(2rem, 2rem)', sortable: false, frozen: true, resizable: false },
  {
    key: 'thumb',
    frozen: true,
    width: 'minmax(4rem, 4rem)',
    label: 'Photo',
    gridLabel: '',
    align: 'start',
    sortable: false,
    resizable: false,
    labelFitRem: 2,
  },
  {
    key: 'fulfillment',
    width: 'minmax(11rem, 11rem)',
    label: 'Fulfillment',
    gridLabel: 'Order',
    type: 'id',
    align: 'start',
    hideKey: 'tracking',
    resizable: false,
    labelFitRem: 5,
  },
  {
    key: 'item',
    width: 'minmax(18rem, 18rem)',
    label: 'Item',
    gridLabel: 'Item',
    type: 'text',
    align: 'start',
    resizable: true,
    minTrackRem: 10,
    labelFitRem: 6,
  },
  {
    key: 'state',
    width: 'minmax(10rem, 10rem)',
    label: 'Status',
    gridLabel: 'Status',
    type: 'tag',
    align: 'start',
    hideKey: 'status',
    resizable: false,
    labelFitRem: 5,
  },
  {
    key: 'open',
    width: 'minmax(2.5rem, 2.5rem)',
    label: 'Open',
    gridLabel: '',
    align: 'end',
    sortable: false,
    resizable: false,
    labelFitRem: 2,
  },
  GRID_FILL_COLUMN,
] as const;

/**
 * Frozen pane — `select · order`. Derived from the column model's `frozen`
 * flag. Operator-editable freeze (pin any column) is future.
 */
const RECEIVING_GRID_LOCKED_KEYS: readonly ReceivingGridColumnKey[] = gridFrozenKeys(RECEIVING_GRID_COLUMNS);

/** Data columns that support click-to-sort (excludes select / paint chrome / `_fill`). */
const RECEIVING_GRID_SORTABLE_KEYS: readonly ReceivingGridColumnKey[] = RECEIVING_GRID_COLUMNS.filter(
  (c) => c.sortable !== false && c.key !== 'select' && c.key !== '_fill',
).map((c) => c.key);

/**
 * Click-to-sort predicate — the ONE sortability answer for this family.
 *
 * Three call sites read it together, which is why admitting a key here is the
 * whole fix rather than a third of it: the descriptor's `isSortable` (TanStack
 * column defs), `ReceivingGridColumnHeader`'s click-to-sort, and
 * `useUrlColumnSort`'s `isColumn` guard (URL durability). A key accepted here
 * is sortable, clickable, and survives a reload as one unit.
 *
 * Org custom columns (`custom:*`) are merged into the column model at RUNTIME
 * from `custom_field_defs`, so they can never appear in the static
 * {@link RECEIVING_GRID_SORTABLE_KEYS} derivation above — they are admitted by
 * key SHAPE instead. Consequence, deliberately accepted: a stale
 * `?colsort=custom:<archived-or-typo>` stays "valid" and degrades to every row
 * blank ⇒ a stable id-order tie. That is quieter than rejecting the param,
 * which would silently drop an operator's shared link back to default order.
 */
export function isReceivingGridSortable(key: string): key is ReceivingGridColumnKey {
  if (isCustomFieldColumnKey(key)) return true;
  return (RECEIVING_GRID_SORTABLE_KEYS as readonly string[]).includes(key);
}

export function receivingGridTemplate(
  columns: readonly ReceivingGridColumn[] = RECEIVING_GRID_COLUMNS,
): string {
  return gridTemplate(columns);
}

export function isReceivingGridFrozen(key: string): boolean {
  return RECEIVING_GRID_LOCKED_KEYS.includes(key as ReceivingGridColumnKey);
}

/**
 * Sticky-left offset for a frozen cell, bound to THIS surface's pane
 * (`select · order`). Offsets derive from THIS surface's columns, never Orders'.
 */
export function receivingGridFrozenLeft(key: string): string {
  return gridFrozenLeft(RECEIVING_GRID_COLUMNS, key);
}

/** Trailing frozen-edge key — owns `data-frozen-edge` scroll shadow. */
export const RECEIVING_GRID_FROZEN_EDGE_KEY: ReceivingGridColumnKey = 'order';


/** Default direction when first activating a column sort. */
export function defaultDirForReceivingGridSort(key: ReceivingGridColumnKey): GridSortDir {
  // Date: most recent first (ops scan). Price / qty: highest first.
  if (key === 'date' || key === 'price' || key === 'qty') return 'desc';
  return 'asc';
}

// (flipReceivingGridSortDir retired — the TanStack sort surface owns the
//  asc ↔ desc cycle via LedgerGridSurface / useGridSurface.)

// Shared spreadsheet chrome — @/design-system/components/grid ledgerGridCell.
export {
  LEDGER_GRID_FROZEN_CELL as RECEIVING_GRID_FROZEN_CELL,
  ledgerGridCell as receivingGridCell,
  ledgerGridRowShellClass as receivingGridRowShellClass,
} from '@/design-system/components/grid/grid-cell-chrome';

// ---------------------------------------------------------------------------
// Incoming POS — separate column array. Do not filter/merge into
// RECEIVING_GRID_COLUMNS. Freeze panes, `_fill`, and tableIds stay distinct.
// ---------------------------------------------------------------------------

export type IncomingGridColumnKey =
  | 'select'
  | 'title'
  | 'date'
  | 'age'
  | 'qty'
  | 'condition'
  | 'status'
  | 'platform'
  | 'order'
  | 'tracking'
  | 'zoho'
  | 'removed';

/** Extends the house model — see {@link LedgerGridColumnModel}; only `key` narrows. */
export interface IncomingGridColumn extends Omit<LedgerGridColumnModel, 'key'> {
  key: IncomingGridColumnKey;
  /** When false, header is not click-to-sort (select gutter only). Default true for data cols. */
  sortable?: boolean;
}

/**
 * Canonical Incoming columns — same keys / types as
 * {@link ORDERS_QUEUE_COLUMNS}, with a receiving-specific Status track.
 * Fact tracks are content-hard `minmax(X,X)`; Product is also a fixed preferred
 * track (Notion overflow pilot — not the fill `1fr` other families still use).
 * `order` hides under legacy `orderid`.
 *
 * ## Default (`core`) set — deliberately lean
 *
 * An inbound line is scanned by: what is it (`title`), when is it due
 * (`date` = Expected), how overdue (`age`), how many (`qty`), where is the
 * delivery (`status`), and the two identifiers an operator types or scans
 * (`order` = PO#, `tracking`). That is the whole default grid.
 *
 * `condition` and `platform` are `optional`. On THIS surface a line has not
 * arrived yet — `condition_grade` is set during unbox/triage, so the Cond cell
 * is the empty dash for nearly every row, and the source channel is secondary
 * to the PO/tracking identity the operator actually acts on. A column that is
 * blank for most rows costs horizontal budget and scan attention for nothing.
 *
 * **Prefs identity:** Incoming mounts under `tableId: "incoming"` — distinct
 * from Unbox/History `tableId: "receiving"`. Tiers may diverge freely between
 * the two descriptors; they no longer share a staff delta bucket.
 */
export const INCOMING_GRID_COLUMNS: readonly IncomingGridColumn[] = [
  { key: 'select', width: 'minmax(2rem, 2rem)', sortable: false, frozen: true },
  // Scrolls with facts — Unbox Sheets golden freezes `select` only (2026-08-04).
  // Header grammar (label · type · align) resolves from SHARED_LINE_TRACK_META so
  // Incoming and History never drift. `headerGlyphOnly` overturned 2026-08-10
  // (Inbound ↔ History one family): Incoming now follows History sentence-case;
  // `gridHeaderShowsLabel` geometry decides the narrow-track glyph fallback.
  { key: 'order', width: 'minmax(7rem, 7rem)', ...SHARED_LINE_TRACK_META.order, omitCellIcon: true },
  // Fixed preferred track — NOT `1fr`. Incoming is the Notion-overflow pilot:
  // columns are content-sized so the row can exceed the card and scroll
  // horizontally; when the sum is narrower than the card, slack is empty canvas
  // right of the last column (not a stretched Product). Other LedgerGrid
  // families keep the fill track until they opt in the same way. Drag-resize
  // still owns the live width via `--cf-col-title`.
  { key: 'title', width: 'minmax(16rem, 16rem)', ...SHARED_LINE_TRACK_META.title },
  // Expected / PO civil date — Pending's "Ship by" / By track.
  // `type: 'date'` end-aligns via `ALIGN_BY_TYPE` (comparable civil day).
  // Day face (default): typed floor 4.5rem — not the stamp floor.
  { key: 'date', width: 'minmax(4.5rem, 4.5rem)', label: 'Expected', type: 'date', dateFace: 'day' },
  // Duration face (`12d` / `4h`) — typed `date` for the clock glyph; end-align
  // comes from the type map (same as By / qty). Floor 3rem via `dateFace`.
  { key: 'age', width: 'minmax(3rem, 3rem)', label: 'Age', type: 'date', dateFace: 'duration' },
  // labelFitRem 3.5 so the `Qty` word shows at the 3.5rem floor, matching History.
  { key: 'qty', width: 'minmax(3.5rem, 3.5rem)', ...SHARED_LINE_TRACK_META.qty, hideKey: 'qty', labelFitRem: 3.5 },
  { key: 'condition', width: 'minmax(5.5rem, 5.5rem)', ...SHARED_LINE_TRACK_META.condition, hideKey: 'condition', tier: 'optional' },
  // Receiving-specific delivery status (hide with meta `rest` in TableColumnConfig).
  // Icon + short Unv. chip when it adds signal (full phrase in tooltip).
  // 4.75rem fits icon + 4-char eyebrow; cells clip via ledgerGridCell grid inset.
  // Header grammar (`Status`, tag, start) is shared; the CELL vocabulary
  // (delivery_state) stays Incoming's own (`ReceivingDeliveryStatusCell`).
  { key: 'status', width: 'minmax(4.75rem, 4.75rem)', ...SHARED_LINE_TRACK_META.status, hideKey: 'rest' },
  // Channel mark — same 4rem external floor as Receiving (mark + inset +
  // hairline breathing). Glyph-only header by intent.
  { key: 'platform', width: 'minmax(4rem, 4rem)', label: 'Platform', type: 'external', hideKey: 'platform', tier: 'optional' },
  // Fits icon + last-8 tracking face (or + TRK# attach face).
  { key: 'tracking', width: 'minmax(8rem, 8rem)', ...SHARED_LINE_TRACK_META.tracking, omitCellIcon: true, hideKey: 'tracking' },
  // Vendor receipt state (`zoho_po_mirror.status`).
  //
  // `optional` on the DEFAULT lane and that is not a hedge — it is the whole
  // ruling. Every row on default Incoming is not-vendor-received BY
  // CONSTRUCTION (`NOT_ZOHO_RECEIVED_PREDICATE` is in the WHERE), so a chip here
  // would paint one identical value on 100% of rows, which is ink that teaches
  // operators to stop reading chips. The lane note states that constant once, at
  // lane altitude, where it belongs.
  //
  // It becomes `core` on exactly the lanes where the value VARIES — a
  // `?tracking_in=` paste (which relaxes the predicate on purpose) and the
  // recently-removed lane (where "the vendor received it" IS one of the exits).
  // See `incomingGridColumnsFor`.
  { key: 'zoho', width: 'minmax(5.5rem, 5.5rem)', ...SHARED_LINE_TRACK_META.zoho, hideKey: 'zoho', tier: 'optional' },
] as const;

/**
 * Why the row left the lane — the recently-removed lane's whole point.
 *
 * Declared OUTSIDE {@link INCOMING_GRID_COLUMNS} rather than as another
 * `optional` member, because on every other lane it could only ever render the
 * dash: a row still ON Incoming has not been removed. An opt-in that can only
 * be empty is not a column an operator should be offered, so this one is
 * ABSENT from the default model and appended for the one lane it means
 * something on. No `hideKey`: the lane exists to show it.
 */
const INCOMING_REMOVED_REASON_COLUMN: IncomingGridColumn = {
  key: 'removed',
  width: 'minmax(7rem, 7rem)',
  label: 'Left because',
  type: 'tag',
};

/**
 * The Incoming column model for a given lane.
 *
 * Column tier is a PER-DESCRIPTOR answer, so a lane that mixes vendor-received
 * rows in promotes the `zoho` chip for itself rather than flipping the shared
 * model — which would turn it on for every receiving grid and re-create the
 * constant-value problem on the lane that does not mix.
 */
export function incomingGridColumnsFor(opts: {
  /** `?tracking_in=` is active — the lane predicate is relaxed, so rows mix. */
  trackingFiltered?: boolean;
  /** The recently-removed lane — "received upstream" is one of its exits. */
  removedLane?: boolean;
}): readonly IncomingGridColumn[] {
  if (!opts.trackingFiltered && !opts.removedLane) return INCOMING_GRID_COLUMNS;
  const promoted = INCOMING_GRID_COLUMNS.map((col) =>
    col.key === 'zoho' ? { ...col, tier: 'core' as const } : col,
  );
  if (!opts.removedLane) return promoted;
  // The reason leads the fact columns: it is what the operator came for.
  const at = promoted.findIndex((c) => c.key === 'date');
  const index = at >= 0 ? at : promoted.length;
  return [...promoted.slice(0, index), INCOMING_REMOVED_REASON_COLUMN, ...promoted.slice(index)];
}

/**
 * Frozen identity pane — `select · order · title`. Derived from the column
 * model's `frozen` flag (one declaration for freeze + immovability + offset
 * math), not from the house key list: the pane is a per-surface answer, and
 * `GRID_IDENTITY_COLUMN_KEYS` remains the two-key house default for surfaces
 * with no order context. See `grid-column-editability.ts`.
 */
export const INCOMING_GRID_LOCKED_KEYS: readonly IncomingGridColumnKey[] = gridFrozenKeys(INCOMING_GRID_COLUMNS);

/** Data columns that support click-to-sort (excludes select). */
export const INCOMING_GRID_SORTABLE_KEYS: readonly IncomingGridColumnKey[] = INCOMING_GRID_COLUMNS.filter(
  (c) => c.sortable !== false && c.key !== 'select',
).map((c) => c.key);

export function isIncomingGridSortable(key: string): key is IncomingGridColumnKey {
  return (INCOMING_GRID_SORTABLE_KEYS as readonly string[]).includes(key);
}

/** @deprecated Alias of the shared waist — kept for an existing test import. */
export const incomingGridColumnTrackRem = gridColumnTrackRem;

export const incomingGridHeaderShowsLabel = gridHeaderShowsLabel;

export function incomingContentMinWidthRem(
  columns: readonly IncomingGridColumn[] = INCOMING_GRID_COLUMNS,
): number {
  return gridContentMinWidthRem(columns);
}

export function incomingGridTemplate(
  columns: readonly IncomingGridColumn[] = INCOMING_GRID_COLUMNS,
): string {
  return gridTemplate(columns);
}

export function isIncomingGridFrozen(key: string): boolean {
  return INCOMING_GRID_LOCKED_KEYS.includes(key as IncomingGridColumnKey);
}

/**
 * Sticky-left offset for a frozen cell, bound to THIS surface's pane.
 *
 * This was `ordersQueueFrozenLeft` under an alias until 2026-08-02, so Incoming
 * computed its offsets from ORDERS' `select · order · title` pane at ORDERS'
 * widths. See {@link gridFrozenLeft}.
 */
export function incomingGridFrozenLeft(key: string): string {
  return gridFrozenLeft(INCOMING_GRID_COLUMNS, key);
}


/** Default direction when first activating a column sort. */
export function defaultDirForIncomingGridSort(key: IncomingGridColumnKey): GridSortDir {
  // Age: most overdue / oldest first (urgency scan), matching Pending.
  if (key === 'age') return 'desc';
  return 'asc';
}

export function flipIncomingGridSortDir(dir: GridSortDir): GridSortDir {
  return dir === 'asc' ? 'desc' : 'asc';
}

/** Civil date source for the Date column (expected → PO → created). */
export function incomingRowDateSource(row: {
  expected_delivery_date?: string | null;
  po_date?: string | null;
  created_at?: string | null;
}): string | null {
  return (
    (row.expected_delivery_date || '').trim() ||
    (row.po_date || '').trim() ||
    (row.created_at || '').trim() ||
    null
  );
}

// Shared spreadsheet chrome — same ledgerGridCell atoms as Receiving, aliased
// so Incoming freeze / header call sites stay on Incoming names.
export {
  LEDGER_GRID_FROZEN_CELL as INCOMING_GRID_FROZEN_CELL,
  ledgerGridCell as incomingGridCell,
  ledgerGridRowShellClass as incomingGridRowShellClass,
} from '@/design-system/components/grid/grid-cell-chrome';
