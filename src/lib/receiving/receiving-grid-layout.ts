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
 * ({@link INCOMING_COMPOUND_COLUMNS}, co-located below — separate layout
 * materializations with shared geometry). The activity-axis stamp (Unboxed / Scanned /
 * Tested) renders as `date` (civil day; full stamp on hover) and its stage NAME
 * as `status`; there is no separate `stage` track. Location is triage shelf
 * placement (`staging_location_label`).
 *
 * Product is a hard preferred track (Sheets-exact drag-resize). Trailing
 * `_fill` owns the sole `1fr` slack — same law as Orders.
 */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  INCOMING_FIELD_CATALOG,
  INCOMING_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/incoming';
import {
  RECEIVING_FIELD_CATALOG,
  RECEIVING_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/receiving';
import { isSlotTrackKey, materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import { isSlotTableChromeTrack } from '@/lib/tables/slot-table-header-sort';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
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
import type { ColumnType } from '@/lib/tables/table-columns';
import {
  isCustomFieldColumnKey,
  type CustomFieldColumnKey,
} from '@/lib/tables/custom-field-keys';


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
  | 'dates'
  | 'state'
  | 'actions'
  | '_fill'
  /** Materialized slot tracks — keys are slot indices, never field ids. */
  | `status:${number}`
  | `subtitle:${number}`
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
export interface ReceivingGridColumn
  extends Omit<LedgerGridColumnModel, 'key'>,
    SlotTrackFields {
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

/**
 * COMPOUND (two-row) Unbox / History / Testing columns.
 *
 * The receiving materialization is derived directly from the shared compound
 * track grammar. Every receiving mount therefore paints the same scan-list
 * geometry rather than choosing between a hand field-key array and this model.
 *
 * **The geometry is not declared here.** It comes from `COMPOUND_TRACKS`
 * (`components/tables/compound/compound-columns.ts`), the one declaration every
 * compound family derives from, so Receiving cannot drift from Orders /
 * Incoming / Tasks by an edit to this file. This line only narrows the key type
 * to `ReceivingGridColumnKey`.
 *
 * **The engine is unchanged.** `LedgerGridSurface` still owns width, freeze,
 * resize, per-staff visibility and virtualization, and `ReceivingGridRow` still
 * dispatches per key. Swapping presentation is therefore a `columns` prop, not
 * a second table component.
 */
export function receivingCompoundColumnsFor(
  layout: SlotLayout,
): readonly ReceivingGridColumn[] {
  return materializeTracks<ReceivingGridColumn>({
    layout,
    catalog: RECEIVING_FIELD_CATALOG,
    base: compoundColumnsFor(),
    // The default anchor — the status band opens after the `state` pill, the
    // position Orders' bound facts occupy on the same shared skeleton.
  });
}

/**
 * The PRODUCT-DEFAULT materialization — what an org with no override mounts.
 *
 * With the product layout's empty status band that is the shared
 * `COMPOUND_TRACKS` verbatim, which is the point: the port reproduces what
 * Unbox / History / Testing paint today, and every catalog fact becomes
 * bindable without a deploy. The `unbox-compound-columns` and
 * `compound-row-model` guards still pin this array against the shared
 * skeleton, so a drift shows up as a red build rather than a visual bug.
 */
export const RECEIVING_COMPOUND_COLUMNS: readonly ReceivingGridColumn[] =
  receivingCompoundColumnsFor(RECEIVING_PRODUCT_LAYOUT);

/**
 * Frozen pane — `select · order`. Derived from the column model's `frozen`
 * flag. Operator-editable freeze (pin any column) is future.
 */
const RECEIVING_GRID_LOCKED_KEYS: readonly ReceivingGridColumnKey[] = gridFrozenKeys(RECEIVING_COMPOUND_COLUMNS);

/** Data columns that support click-to-sort (excludes select / paint chrome / `_fill`). */
const RECEIVING_GRID_SORTABLE_KEYS: readonly ReceivingGridColumnKey[] = [
  'title',
  'date',
  'qty',
  'price',
  'condition',
  'location',
  'order',
  'tracking',
  'serial',
  'zoho',
  'fulfillment',
  'item',
  'status',
];

/** Comparator types for durable receiving sort facts, independent of slots. */
export const RECEIVING_SORT_FACT_TYPES: Readonly<Partial<Record<ReceivingGridColumnKey, ColumnType>>> = {
  title: 'text',
  date: 'date',
  qty: 'number',
  price: 'price',
  condition: 'tag',
  location: 'location',
  order: 'id',
  tracking: 'tracking',
  serial: 'id',
  fulfillment: 'id',
  item: 'text',
  status: 'tag',
};

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
/**
 * Compound track → the FLAT fact word it carries.
 *
 * The twin of `queue-display-sort`'s `COMPOUND_TRACK_SORT_KEYS`, and it exists
 * for the bug that module documents: when To-Ship's mount moved to the compound
 * tracks nothing updated the sort vocabulary, so `isColumn` rejected every
 * header key and **clicking a header silently did nothing**. Wave 1.3 moved
 * Unbox / History / Testing onto the same tracks with the same omission.
 *
 * A compound track is a CONTAINER for facts the flat model already sorted by,
 * so this re-connects existing comparators rather than inventing orderings:
 * `fulfillment` carries the PO (`order`), `item` the product title, `amount`
 * the Zoho line rate (`price`), `state` the workflow pill (`status`).
 */
const RECEIVING_TRACK_SORT_FACTS: Readonly<Record<string, ReceivingGridColumnKey>> = {
  // The DATES track's second line is the DEADLINE, so it sorts by the deadline
  // fact this family already compares by — the start date above it is context.
  dates: 'date',
  fulfillment: 'order',
  item: 'title',
  amount: 'price',
  state: 'status',
};

const RECEIVING_SLOT_SORT_FACTS: Readonly<Record<string, ReceivingGridColumnKey>> = {
  'receiving.order': 'order',
  'receiving.status': 'status',
  'receiving.qty': 'qty',
  'receiving.price': 'price',
  'receiving.condition': 'condition',
  'receiving.location': 'location',
  'receiving.tracking': 'tracking',
  'receiving.serial': 'serial',
};

function isReceivingChromeKey(key: string): boolean {
  return isSlotTableChromeTrack(key);
}

/**
 * Normalize a header key to the fact word this family sorts by.
 *
 * All mounts run through it: compound desks emit track keys while durable URLs
 * may still carry the original fact words. One function keeps those spellings
 * mapped to one comparator vocabulary.
 */
export function receivingSortFactFor(
  key: string,
  fieldId?: string | null,
): ReceivingGridColumnKey | null {
  if (isReceivingChromeKey(key)) return null;
  if (isCustomFieldColumnKey(key)) return key as ReceivingGridColumnKey;
  if (fieldId && RECEIVING_SLOT_SORT_FACTS[fieldId]) return RECEIVING_SLOT_SORT_FACTS[fieldId];
  const track = RECEIVING_TRACK_SORT_FACTS[key];
  if (track) return track;
  return (RECEIVING_GRID_SORTABLE_KEYS as readonly string[]).includes(key)
    ? (key as ReceivingGridColumnKey)
    : null;
}

export function isReceivingGridSortable(
  key: string,
  fieldId?: string | null,
): key is ReceivingGridColumnKey {
  if (receivingSortFactFor(key, fieldId) != null) return true;
  return isSlotTrackKey(key);
}

export function receivingGridTemplate(
  columns: readonly ReceivingGridColumn[] = RECEIVING_COMPOUND_COLUMNS,
): string {
  return gridTemplate(columns);
}

export function isReceivingGridFrozen(key: string): boolean {
  return RECEIVING_GRID_LOCKED_KEYS.includes(key as ReceivingGridColumnKey);
}

/**
 * Sticky-left offset for a frozen cell, bound to THIS surface's pane
 * (`select · fulfillment · thumb`). Offsets derive from THIS surface's columns, never Orders'.
 */
export function receivingGridFrozenLeft(key: string): string {
  return gridFrozenLeft(RECEIVING_COMPOUND_COLUMNS, key);
}

/** Trailing frozen-edge key — owns `data-frozen-edge` scroll shadow. */
export const RECEIVING_GRID_FROZEN_EDGE_KEY: ReceivingGridColumnKey = 'thumb';


/** Default direction when first activating a column sort. */
export function defaultDirForReceivingGridSort(key: ReceivingGridColumnKey): GridSortDir {
  // Date: most recent first (ops scan). Price / qty: highest first.
  if (key === 'date' || key === 'price' || key === 'qty') {
    return 'desc';
  }
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
// Incoming POS — separate layout materialization and tableId.
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
  /** Compound (two-row) presentation tracks — see {@link INCOMING_COMPOUND_COLUMNS}. */
  | 'thumb'
  | 'item'
  | 'fulfillment'
  | 'dates'
  | 'state'
  | 'actions'
  | '_fill'
  /** Materialized slot tracks — keys are slot indices, never field ids. */
  | `status:${number}`
  | `subtitle:${number}`;

/** Extends the house model — see {@link LedgerGridColumnModel}; only `key` narrows. */
export interface IncomingGridColumn
  extends Omit<LedgerGridColumnModel, 'key'>,
    SlotTrackFields {
  key: IncomingGridColumnKey;
  /** When false, header is not click-to-sort (select gutter only). Default true for data cols. */
  sortable?: boolean;
}


/**
 * The `removed` lane's reason column, and the lane-conditional model that
 * appended it, were DELETED when Incoming moved to the compound layout
 * (2026-08-21).
 *
 * `incomingGridColumnsFor()` existed to hand the recently-removed lane a sixth
 * track no other lane could use, and to promote `zoho` when a tracking filter
 * mixed vendor rows in. The compound model has no room for a per-lane track and
 * wants none: the removal reason rides the STATE pill via `incomingStateFace`,
 * which is how Incoming keeps a column array byte-identical to Receiving's,
 * Orders' and Tasks'.
 *
 * Deleted rather than left standing, per `pattern-evolution.md`: "a retirement
 * is not done until the old path is DELETED". Both call sites now mount
 * {@link INCOMING_COMPOUND_COLUMNS}.
 */

/**
 * COMPOUND (two-row) Incoming columns.
 *
 * The SAME tracks Receiving, Orders and Tasks mount — derived from
 * `COMPOUND_TRACKS`, not copied. This line only narrows the key type.
 *
 * **There is no lane variant, and specifically no compound twin of
 * {@link incomingGridColumnsFor}.** The flat model appends a `removed` track on
 * the recently-removed lane because that lane exists to answer "why did this
 * leave"; the compound row answers it in the STATE pill instead
 * (`incomingStateFace` — see `incoming-compound-view.ts`), so the column model
 * stays byte-identical to every other family's. A lane-conditional compound
 * array would be the first crack in "any visual difference between two tables
 * is a data difference".
 */
export function incomingCompoundColumnsFor(
  layout: SlotLayout,
): readonly IncomingGridColumn[] {
  return materializeTracks<IncomingGridColumn>({
    layout,
    catalog: INCOMING_FIELD_CATALOG,
    base: compoundColumnsFor(),
    // Default anchor: the status band opens after the `state` pill, the same
    // position Orders' and Receiving's bound facts take on this skeleton.
  });
}

/**
 * The PRODUCT-DEFAULT materialization — what an org with no override mounts.
 *
 * With the product layout's empty status band that is the shared
 * `COMPOUND_TRACKS` verbatim: the port reproduces what the Incoming rails paint
 * today, and every catalog fact becomes bindable without a deploy. Incoming and
 * Receiving keep SEPARATE layout documents (two tableIds) for the same reason
 * they keep separate prefs buckets — one cell map, two vocabularies.
 */
export const INCOMING_COMPOUND_COLUMNS: readonly IncomingGridColumn[] =
  incomingCompoundColumnsFor(INCOMING_PRODUCT_LAYOUT);

/**
 * Frozen identity pane — `select · order · title`. Derived from the column
 * model's `frozen` flag (one declaration for freeze + immovability + offset
 * math), not from the house key list: the pane is a per-surface answer, and
 * `GRID_IDENTITY_COLUMN_KEYS` remains the two-key house default for surfaces
 * with no order context. See `grid-column-editability.ts`.
 */
export const INCOMING_GRID_LOCKED_KEYS: readonly IncomingGridColumnKey[] = gridFrozenKeys(INCOMING_COMPOUND_COLUMNS);

/** Data columns that support click-to-sort (excludes select). */
export const INCOMING_GRID_SORTABLE_KEYS: readonly IncomingGridColumnKey[] = [
  'title',
  'date',
  'age',
  'qty',
  'condition',
  'status',
  'platform',
  'order',
  'tracking',
  'zoho',
  'fulfillment',
  'item',
  'state',
];

/**
 * Compound track → the FLAT fact word it carries — Receiving's twin, same
 * reason (see {@link receivingSortFactFor}).
 *
 * `state` IS mapped here: `compareIncomingGridRows` carries a real `statusRank`.
 */
const INCOMING_TRACK_SORT_FACTS: Readonly<Record<string, IncomingGridColumnKey>> = {
  // The DATES track's second line is the DEADLINE, so it sorts by the deadline
  // fact this family already compares by — the start date above it is context.
  dates: 'date',
  fulfillment: 'order',
  item: 'title',
  state: 'status',
};

const INCOMING_SLOT_SORT_FACTS: Readonly<Record<string, IncomingGridColumnKey>> = {
  'incoming.order': 'order',
  'incoming.expected': 'date',
  'incoming.qty': 'qty',
  'incoming.status': 'status',
  'incoming.platform': 'platform',
  'incoming.tracking': 'tracking',
  'incoming.condition': 'condition',
};

function isIncomingChromeKey(key: string): boolean {
  return isSlotTableChromeTrack(key);
}

/** Normalize a header key to the fact word this family sorts by. */
export function incomingSortFactFor(
  key: string,
  fieldId?: string | null,
): IncomingGridColumnKey | null {
  if (isIncomingChromeKey(key)) return null;
  if (fieldId && INCOMING_SLOT_SORT_FACTS[fieldId]) return INCOMING_SLOT_SORT_FACTS[fieldId];
  const track = INCOMING_TRACK_SORT_FACTS[key];
  if (track) return track;
  return (INCOMING_GRID_SORTABLE_KEYS as readonly string[]).includes(key)
    ? (key as IncomingGridColumnKey)
    : null;
}

export function isIncomingGridSortable(
  key: string,
  fieldId?: string | null,
): key is IncomingGridColumnKey {
  if (incomingSortFactFor(key, fieldId) != null) return true;
  return isSlotTrackKey(key);
}

/** @deprecated Alias of the shared waist — kept for an existing test import. */
export const incomingGridColumnTrackRem = gridColumnTrackRem;

export const incomingGridHeaderShowsLabel = gridHeaderShowsLabel;

export function incomingContentMinWidthRem(
  columns: readonly IncomingGridColumn[] = INCOMING_COMPOUND_COLUMNS,
): number {
  return gridContentMinWidthRem(columns);
}

export function incomingGridTemplate(
  columns: readonly IncomingGridColumn[] = INCOMING_COMPOUND_COLUMNS,
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
  return gridFrozenLeft(INCOMING_COMPOUND_COLUMNS, key);
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
