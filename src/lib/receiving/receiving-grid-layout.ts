/**
 * Unbox / History / Testing spreadsheet column model — SoT for receiving-line
 * LedgerGrid surfaces that are not Incoming POS.
 *
 * Same spreadsheet family as Pending / Incoming (Date as a per-row column —
 * no sticky day-band headers on these rails):
 *   select · order · title · status · date · qty · cond · location · platform · tracking · serial
 *
 * Incoming keeps its own Expected / Age / Status columns
 * ({@link INCOMING_GRID_COLUMNS}). The activity-axis stamp (Unboxed / Scanned /
 * Tested) renders as `date` (day + time) and its stage NAME as `status`;
 * there is no separate `stage` track. Location is triage shelf placement
 * (`staging_location_label`).
 */

import { gridFrozenKeys } from '@/design-system/components/grid/grid-column-editability';
import {
  gridFrozenLeft,
  gridTemplate,
} from '@/design-system/components/grid/grid-column-geometry';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type ReceivingGridColumnKey =
  | 'select'
  | 'title'
  | 'status'
  | 'date'
  | 'qty'
  | 'condition'
  | 'location'
  | 'platform'
  | 'order'
  | 'tracking'
  | 'serial'
  | 'zoho'
  /** Trailing structural filler — absorbs leftover sheet width; not a fact column. */
  | '_fill';

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
 * Canonical Unbox / History / Testing columns. Fact tracks are content-hard
 * `minmax(X,X)`; Product is also a fixed preferred track (Sheets/Notion
 * overflow — same unlock as Incoming). Drag-resize sets exact px via
 * `--cf-col-title`; leftover sheet width is absorbed by trailing `_fill`
 * (`minmax(0rem, 1fr)`), not a stretched Product. Select-only freeze stays:
 * Order / Product scroll with the facts.
 *
 * ## Default (`core`) set — deliberately lean
 *
 * A receiving line is scanned by: which PO (`order`), what is it (`title`),
 * what state (`status`), when did it reach it (`date`), how many (`qty`), where
 * did triage place it (`location`), and the other identifier an operator scans
 * (`tracking`). That is the whole default grid.
 *
 * `condition`, `platform` and `serial` are `optional` — not because they are
 * unimportant, but because on THIS surface they are usually empty at the moment
 * the row is being scanned (condition and serial are set during unbox; platform
 * is secondary to the PO/tracking identity). A column that is blank for most
 * rows costs horizontal budget and scan attention for nothing. Staff who work a
 * lane where they matter turn them on once, and it follows them across devices.
 */
export const RECEIVING_GRID_COLUMNS: readonly ReceivingGridColumn[] = [
  // Sheets-class freeze: only the select gutter is sticky. Order / Product scroll
  // with the fact columns (2026-08-04). Operator-editable freeze panes (pin any
  // column, like Google Sheets) are a future capability — do not hard-freeze
  // title/order again as a permanent house answer.
  { key: 'select', width: 'minmax(2rem, 2rem)', sortable: false, frozen: true },
  // PO number — scrollable fact track. Still always-on (no hideKey): it is the
  // scan handle, but it no longer steals sticky budget from the sheet plane.
  //
  // `align: 'start'` — a transaction identity is a name you read, not a
  // magnitude compared down the column. Declared exception to `ALIGN_BY_TYPE.id`
  // (2026-08-02); `serial` below keeps `end` as a reference attribute.
  { key: 'order', width: 'minmax(7rem, 7rem)', label: 'Order', type: 'id', align: 'start', labelFitRem: 4.5 },
  // Fixed preferred track — NOT `1fr`. A fill track made Product drag-resize a
  // floor-only change while `1fr` kept stretching to the card (narrower = no
  // visible move). Content-sized so resize is Sheets-exact and the sheet can
  // scroll when columns exceed the port.
  {
    key: 'title',
    width: 'minmax(16rem, 16rem)',
    label: 'Product Title',
    gridLabel: 'Product',
    type: 'text',
    labelFitRem: 8,
  },
  // The row's lifecycle STATE — dot · stage name (`ReceivingStatusCell`). It
  // exists because the stage name used to appear only in the `stage` column's
  // runtime header label, so a row could not be read without keeping the header
  // in your head. `type: 'tag'` (a categorical label, start-aligned and
  // drag-resizable, unlike the fixed-format types).
  //
  // It briefly also carried the day + time (2026-08-02) and gave them back the
  // same day: a state and a stamp are two facts, and merging them cost the
  // stamps their alignment down the axis, made the track size for
  // longest-word + longest-stamp, and welded two sorts into one. 6rem holds
  // `Matched` / `Unboxed` / `Received` beside the dot.
  { key: 'status', width: 'minmax(6rem, 6rem)', label: 'Status', type: 'tag', hideKey: 'status', labelFitRem: 4.5 },
  // WHEN it reached that stage — day + time (`Jul 31 4:19 PM`) in one track.
  // Stamp face: typed floor is 12rem (`resolveGridColumnMinTrackRem` /
  // `dateFace: 'stamp'`). Narrower tracks left-clipped end-aligned nowrap
  // stamps under overflow-hidden (`g 3 4:54 PM`).
  {
    key: 'date',
    width: 'minmax(12rem, 12rem)',
    label: 'Date',
    gridLabel: 'Date',
    type: 'date',
    dateFace: 'stamp',
    hideKey: 'date',
    labelFitRem: 4.5,
  },
  // Qty keeps the word label — Order scrolls on this surface again, and both
  // `number` and `id` map to the hash glyph, so a bare `#` would collide with
  // `# Order` in one scan path. Incoming still freezes Order and may keep
  // `headerGlyphOnly`.
  { key: 'qty', width: 'minmax(3.5rem, 3.5rem)', label: 'Qty', type: 'number', hideKey: 'qty', labelFitRem: 3.5 },
  { key: 'condition', width: 'minmax(5.5rem, 5.5rem)', label: 'Cond', type: 'tag', hideKey: 'condition', tier: 'optional', labelFitRem: 4.5 },
  // A `stage` track sat here until 2026-08-02, carrying the activity-axis CLOCK
  // under a runtime header label (Unboxed / Scanned / Tested). Both halves left:
  // the clock moved into `date` when that column grew to day + time, and the
  // stage NAME became the `status` track. What remained was a second column
  // rendering the same `ctx.stageDisplay` string as `date`, so a staffer who
  // opted it back on from the column-display rail read one clock twice. Deleted
  // rather than left demoted — the whole per-mount `stageLabel` header chain
  // went with it. Do not reintroduce it: `date` + `status` answer both questions.
  // Triage shelf placement (Arrival Location Placement) — core for Unbox Queue.
  {
    key: 'location',
    width: 'minmax(6.5rem, 6.5rem)',
    label: 'Location',
    gridLabel: 'Loc',
    type: 'location',
    hideKey: 'stagingloc',
    labelFitRem: 4.5,
  },
  { key: 'platform', width: 'minmax(3rem, 3rem)', label: 'Platform', gridLabel: 'Ch.', type: 'external', hideKey: 'platform', tier: 'optional', labelFitRem: 4.5 },
  { key: 'tracking', width: 'minmax(8rem, 8rem)', label: 'Tracking', type: 'tracking', omitCellIcon: true, hideKey: 'tracking', labelFitRem: 4.5 },
  { key: 'serial', width: 'minmax(8rem, 8rem)', label: 'Serial', type: 'id', hideKey: 'serial', tier: 'optional', labelFitRem: 4.5 },
  // Vendor receipt state — what the purchasing source says about this row's PO
  // (`zoho_po_mirror.status`). `tag`, so it start-aligns and drag-resizes like
  // every other categorical chip; NEVER folded into `status`, which is the
  // LOCAL lifecycle state. Two facts, two columns.
  //
  // `optional` here, and that is the point of the tier: on History the vendor
  // status is historical enrichment, so the column is available and off. The
  // lanes where it VARIES — the bulk-paste results and the recently-removed
  // lane — promote it to `core` on their own descriptor. Flipping it here would
  // turn it on for every receiving grid and re-create the always-the-same-value
  // problem the lane note exists to solve.
  { key: 'zoho', width: 'minmax(5.5rem, 5.5rem)', label: 'Vendor', type: 'tag', hideKey: 'zoho', tier: 'optional', labelFitRem: 4.5 },
  // Trailing filler — geometry only. Absorbs zoom-out / wide-card slack so fact
  // tracks stay content-hard. No label, type, hideKey, or tier: never in Column
  // display; Column discovery stays triage ▤ / header menus.
  { key: '_fill', width: 'minmax(0rem, 1fr)', sortable: false, resizable: false },
] as const;

/**
 * Frozen pane — select gutter only (Sheets-class). Derived from the column
 * model's `frozen` flag. Operator-editable freeze (pin any column) is future.
 */
const RECEIVING_GRID_LOCKED_KEYS: readonly ReceivingGridColumnKey[] = gridFrozenKeys(RECEIVING_GRID_COLUMNS);

/** Data columns that support click-to-sort (excludes select / paint chrome). */
const RECEIVING_GRID_SORTABLE_KEYS: readonly ReceivingGridColumnKey[] = RECEIVING_GRID_COLUMNS.filter(
  (c) => c.sortable !== false && c.key !== 'select',
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
 * Sticky-left offset for a frozen cell, bound to THIS surface's pane.
 *
 * Receiving's pane is select-only (Sheets-class); offsets still derive from
 * THIS surface's columns, never Orders'.
 */
export function receivingGridFrozenLeft(key: string): string {
  return gridFrozenLeft(RECEIVING_GRID_COLUMNS, key);
}


/** Default direction when first activating a column sort. */
export function defaultDirForReceivingGridSort(key: ReceivingGridColumnKey): GridSortDir {
  // Date: most recent first (ops scan).
  if (key === 'date') return 'desc';
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
