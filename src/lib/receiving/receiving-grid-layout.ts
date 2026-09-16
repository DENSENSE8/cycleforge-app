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

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  INCOMING_FIELD_CATALOG,
  INCOMING_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/incoming';
import {
  RECEIVING_FIELD_CATALOG,
  RECEIVING_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/receiving';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import { gridFrozenKeys } from '@/design-system/components/grid/grid-column-editability';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
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
 * COMPOUND (two-row) Unbox / History / Testing columns.
 *
 * A **sibling array, never a filter of {@link RECEIVING_GRID_COLUMNS}** — the
 * same rule `INCOMING_GRID_COLUMNS` follows above. The two models answer
 * different questions: the flat one is a spreadsheet (one fact per track, each
 * independently sortable), this one is a scan list (four compound cells, each
 * pairing an identifier with its qualifier).
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
    base: compoundColumnsFor<ReceivingGridColumn>(),
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
 * Frozen pane of the MOUNTED model — `select · order · thumb`. Derived from the
 * compound materialization because that is what every desk paints; the flat
 * spreadsheet array it used to read is deleted.
 */
const RECEIVING_GRID_LOCKED_KEYS: readonly ReceivingGridColumnKey[] = gridFrozenKeys(
  RECEIVING_COMPOUND_COLUMNS,
);

/**
 * The fact words this family sorts by — declared, not derived.
 *
 * It used to be a filter over the deleted flat `RECEIVING_GRID_COLUMNS`. A sort
 * vocabulary is not a column layout: deriving it from a dead model kept the
 * model alive for nothing, and every compound track resolves to one of these
 * words through {@link RECEIVING_TRACK_SORT_FACTS} anyway.
 */
const RECEIVING_GRID_SORTABLE_KEYS: readonly ReceivingGridColumnKey[] = [
  'order',
  'title',
  'status',
  'date',
  'qty',
  'price',
  'condition',
  'location',
  'tracking',
  'serial',
  'zoho',
];

/**
 * The comparator shape each fact sorts under. On the FACT rather than read off
 * a column: it used to be `RECEIVING_GRID_COLUMNS.find(...)?.type`, which
 * returns `undefined` for every compound track and died with the flat array.
 * Values are byte-identical to what that array declared.
 */
export const RECEIVING_SORT_FACT_TYPES: Readonly<
  Partial<Record<ReceivingGridColumnKey, LedgerGridColumnModel['type']>>
> = {
  order: 'id',
  title: 'text',
  status: 'tag',
  date: 'date',
  qty: 'number',
  price: 'price',
  condition: 'tag',
  location: 'location',
  tracking: 'tracking',
  serial: 'id',
  zoho: 'tag',
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
 * the Zoho line rate (`price`).
 *
 * `state` is deliberately ABSENT. `compareReceivingGridRows` has no `status`
 * arm — the flat model never column-sorted the stage either — so admitting the
 * track would offer a click that resolves to `null` for every row. Incoming's
 * twin DOES map it, because `compareIncomingGridRows` has a real `statusRank`.
 * Adding one here means adding a comparator arm, which is the point at which it
 * is a product decision rather than a restoration.
 */
const RECEIVING_TRACK_SORT_FACTS: Readonly<Record<string, ReceivingGridColumnKey>> = {
  dates: 'date',
  fulfillment: 'order',
  item: 'title',
  amount: 'price',
  state: 'status',
};

/**
 * Normalize a header key to the fact word this family sorts by.
 *
 * Both mounts run through it: the compound desks emit track keys, and the flat
 * `/test` history mount (which takes the definition's own columns) emits the
 * flat words. One function, so the two models cannot drift into two answers.
 */
export function receivingSortFactFor(key: string): ReceivingGridColumnKey | null {
  if (isCustomFieldColumnKey(key)) return key as ReceivingGridColumnKey;
  const track = RECEIVING_TRACK_SORT_FACTS[key];
  if (track) return track;
  return (RECEIVING_GRID_SORTABLE_KEYS as readonly string[]).includes(key)
    ? (key as ReceivingGridColumnKey)
    : null;
}

export function isReceivingGridSortable(key: string): key is ReceivingGridColumnKey {
  return receivingSortFactFor(key) != null;
}

export function isReceivingGridFrozen(key: string): boolean {
  return RECEIVING_GRID_LOCKED_KEYS.includes(key as ReceivingGridColumnKey);
}



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
// Incoming POS — its own key union and prefs identity. Both families mount the
// shared compound tracks; neither keeps a flat spreadsheet array any more.
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
    base: compoundColumnsFor<IncomingGridColumn>(),
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
 * Frozen pane of the MOUNTED model — `select · order · thumb`. Derived from the
 * compound materialization's `frozen` flag (one declaration for freeze +
 * immovability + offset math). The flat array it used to read is deleted.
 */
export const INCOMING_GRID_LOCKED_KEYS: readonly IncomingGridColumnKey[] = gridFrozenKeys(
  INCOMING_COMPOUND_COLUMNS,
);

/**
 * The fact words this family sorts by — declared, not derived (see
 * {@link receivingSortFactFor} for why a vocabulary is not a layout).
 */
export const INCOMING_GRID_SORTABLE_KEYS: readonly IncomingGridColumnKey[] = [
  'order',
  'title',
  'date',
  'age',
  'qty',
  'condition',
  'status',
  'platform',
  'tracking',
  'zoho',
];

/**
 * Compound track → the FLAT fact word it carries — Receiving's twin, same
 * reason (see {@link receivingSortFactFor}).
 *
 * `state` IS mapped here, unlike Receiving: `compareIncomingGridRows` carries a
 * real `statusRank` (delivery state, then confidence), so the stage pill has an
 * ordering to restore rather than one to invent. `amount` stays absent — an
 * inbound POS line has no money track to sort.
 */
const INCOMING_TRACK_SORT_FACTS: Readonly<Record<string, IncomingGridColumnKey>> = {
  dates: 'date',
  fulfillment: 'order',
  item: 'title',
  state: 'status',
};

/** Normalize a header key to the fact word this family sorts by. */
export function incomingSortFactFor(key: string): IncomingGridColumnKey | null {
  const track = INCOMING_TRACK_SORT_FACTS[key];
  if (track) return track;
  return (INCOMING_GRID_SORTABLE_KEYS as readonly string[]).includes(key)
    ? (key as IncomingGridColumnKey)
    : null;
}

export function isIncomingGridSortable(key: string): key is IncomingGridColumnKey {
  return incomingSortFactFor(key) != null;
}

export function isIncomingGridFrozen(key: string): boolean {
  return INCOMING_GRID_LOCKED_KEYS.includes(key as IncomingGridColumnKey);
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
