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
 * ({@link INCOMING_GRID_COLUMNS}). The activity-axis stamp (Unboxed / Scanned /
 * Tested) renders as `date` (civil day; full stamp on hover) and its stage NAME
 * as `status`; there is no separate `stage` track. Location is triage shelf
 * placement (`staging_location_label`).
 *
 * Product is a hard preferred track (Sheets-exact drag-resize). Trailing
 * `_fill` owns the sole `1fr` slack — same law as Orders.
 */

import { gridFrozenKeys } from '@/design-system/components/grid/grid-column-editability';
import {
  gridFrozenLeft,
  gridTemplate,
} from '@/design-system/components/grid/grid-column-geometry';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import type { CustomFieldColumnKey } from '@/lib/tables/custom-field-keys';

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
    label: 'Order',
    type: 'id',
    align: 'start',
    frozen: true,
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
    label: 'Product Title',
    gridLabel: 'Product',
    type: 'text',
    align: 'start',
    resizable: true,
    minTrackRem: 8,
    labelFitRem: 8,
  },
  // The row's lifecycle STATE — dot · stage name (`ReceivingStatusCell`).
  // Drag-resizable (2026-08-06): content-hard 6rem floor, widened via
  // `--cf-col-status` for long stage names.
  { key: 'status', width: 'minmax(6rem, 6rem)', label: 'Status', type: 'tag', align: 'start', hideKey: 'status', resizable: true, labelFitRem: 4.5 },
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
  { key: 'qty', width: 'minmax(3.5rem, 3.5rem)', label: 'Qty', type: 'number', align: 'end', hideKey: 'qty', resizable: false, labelFitRem: 3.5 },
  // Zoho PO line unit cost — magnitude → end. Header owns the Receipt glyph;
  // dense Sheets face keeps the cell mark omitted (`omitCellIcon`).
  { key: 'price', width: 'minmax(5.5rem, 5.5rem)', label: 'Price', type: 'price', align: 'end', omitCellIcon: true, hideKey: 'price', resizable: false, labelFitRem: 4.5 },
  { key: 'condition', width: 'minmax(5.5rem, 5.5rem)', label: 'Cond', type: 'tag', align: 'start', hideKey: 'condition', tier: 'optional', resizable: false, labelFitRem: 4.5 },
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
    label: 'Tracking',
    type: 'tracking',
    align: 'start',
    omitCellIcon: true,
    hideKey: 'tracking',
    resizable: false,
    labelFitRem: 4.5,
  },
  { key: 'serial', width: 'minmax(8rem, 8rem)', label: 'Serial', type: 'id', align: 'start', hideKey: 'serial', tier: 'optional', resizable: false, labelFitRem: 4.5 },
  { key: 'zoho', width: 'minmax(5.5rem, 5.5rem)', label: 'Vendor', type: 'tag', align: 'start', hideKey: 'zoho', tier: 'optional', resizable: false, labelFitRem: 4.5 },
  // Trailing filler — geometry only. Absorbs zoom-out / wide-card slack so fact
  // tracks stay content-hard. No label, type, hideKey, or tier: never in Column
  // display; Column discovery stays triage ▦ / header menus.
  { key: '_fill', width: 'minmax(0rem, 1fr)', sortable: false, resizable: false },
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

export function isReceivingGridSortable(key: string): key is ReceivingGridColumnKey {
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
