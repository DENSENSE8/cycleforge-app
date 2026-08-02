/**
 * Unbox / History / Testing spreadsheet column model — SoT for receiving-line
 * LedgerGrid surfaces that are not Incoming POS.
 *
 * Same spreadsheet family as Pending / Incoming (Date as a per-row column —
 * no sticky day-band headers on these rails):
 *   select · title · date · qty · cond · stage · location · platform · order · tracking · serial
 *
 * Incoming keeps its own Expected / Age / Status columns
 * ({@link INCOMING_GRID_COLUMNS}). Stage label (Unboxed / Scanned / Tested) is
 * a header prop — the track key stays `stage`. Date is the civil day of the
 * activity-axis stamp (Unboxed / Scanned / Tested). Location is triage shelf
 * placement (`staging_location_label`).
 */

import { gridFrozenKeys } from '@/design-system/components/grid/grid-column-editability';
import { gridTemplate } from '@/design-system/components/grid/grid-column-geometry';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type ReceivingGridColumnKey =
  | 'select'
  | 'title'
  | 'status'
  | 'date'
  | 'qty'
  | 'condition'
  | 'stage'
  | 'location'
  | 'platform'
  | 'order'
  | 'tracking'
  | 'serial';

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
 * `minmax(X,X)`; only `title` flexes. `order` hides under legacy `orderid`;
 * `stage` hides under meta `rest`.
 *
 * ## Default (`core`) set — deliberately lean
 *
 * A receiving line is scanned by: what is it (`title`), when did it land
 * (`date`), how many (`qty`), where is it in the flow (`stage`), where did
 * triage place it (`location`), and the two identifiers an operator actually
 * types or scans (`order` = PO#, `tracking`). That is the whole default grid.
 *
 * `condition`, `platform` and `serial` are `optional` — not because they are
 * unimportant, but because on THIS surface they are usually empty at the moment
 * the row is being scanned (condition and serial are set during unbox; platform
 * is secondary to the PO/tracking identity). A column that is blank for most
 * rows costs horizontal budget and scan attention for nothing. Staff who work a
 * lane where they matter turn them on once, and it follows them across devices.
 */
export const RECEIVING_GRID_COLUMNS: readonly ReceivingGridColumn[] = [
  { key: 'select', width: 'minmax(2rem, 2rem)', sortable: false, frozen: true },
  {
    key: 'title',
    frozen: true,
    width: 'minmax(12rem, 1fr)',
    label: 'Product Title',
    gridLabel: 'Product',
    type: 'text',
    labelFitRem: 8,
  },
  // The row's lifecycle answer in ONE track: dot · stage name · day · time
  // (`ReceivingStatusCell`). Added 2026-08-02, replacing the split where `date`
  // held `Jul 31`, `stage` held `4:19 PM`, and the STAGE NAME appeared only in
  // the `stage` column's runtime header label — so a row could not be read
  // without keeping the header in your head. `type: 'tag'` (a categorical
  // label, start-aligned and drag-resizable, unlike the fixed-format types).
  { key: 'status', width: 'minmax(11rem, 11rem)', label: 'Status', type: 'tag', hideKey: 'status', labelFitRem: 4.5 },
  // Civil day of the activity-axis stamp — Pending/Incoming Date column recipe.
  // Demoted to `optional` when `status` absorbed it: both render the same day,
  // and two tracks for one fact is what the merge removed. Kept (not deleted)
  // so a staffer who wants the split back can opt in — and so an existing
  // `hidden`/`shown` delta stays meaningful.
  { key: 'date', width: 'minmax(4.5rem, 4.5rem)', label: 'Date', gridLabel: 'Date', type: 'date', hideKey: 'date', tier: 'optional', labelFitRem: 4.5 },
  // 3.5rem / fit 3.5 matches the Pending grid exactly, so the header reads
  // `Qty` instead of a bare `#`. The glyph fallback was ambiguous here: the
  // type registry maps BOTH `number` and `id` to the hash mark, so a label-less
  // qty column was indistinguishable from the Order column two tracks over.
  { key: 'qty', width: 'minmax(3.5rem, 3.5rem)', label: 'Qty', type: 'number', hideKey: 'qty', labelFitRem: 3.5 },
  { key: 'condition', width: 'minmax(5.5rem, 5.5rem)', label: 'Cond', type: 'tag', hideKey: 'condition', tier: 'optional', labelFitRem: 4.5 },
  // Stage clock — hide with meta `rest`. Sized for the RUNTIME label (`Unboxed` /
  // `Scanned` / `Tested`, injected by the header's `stageLabel` prop), not for the
  // placeholder `Stage` declared here.
  //
  // Measured: inset 16px + one mark slot 16px + `UNBOXED` 45.6px = 77.6px in an
  // 80px track. It clipped to `UNBO…` only because a sorted header used to draw
  // the type glyph AND the chevron (93.6px); the header now reuses one mark slot,
  // so 5rem holds all three stage words in either sort state.
  //
  // `type: 'date'` only so the header draws the clock glyph — the cell is a
  // prose stage word, so `align: 'start'` overrides the numeric `date → end` default.
  // Demoted to `optional` alongside `date` — `status` now carries this stamp
  // WITH the stage name beside it, which is the half this column could never
  // show in the row itself.
  { key: 'stage', width: 'minmax(5rem, 5rem)', label: 'Stage', type: 'date', align: 'start', hideKey: 'rest', tier: 'optional', labelFitRem: 4.5 },
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
  // `align: 'start'` — the PO / order number is this row's transaction identity
  // (a name you read), not a magnitude. Declared exception to `ALIGN_BY_TYPE.id`
  // ruled 2026-08-02; `serial` below keeps `end` as a reference attribute.
  { key: 'order', width: 'minmax(7rem, 7rem)', label: 'Order', type: 'id', align: 'start', hideKey: 'orderid', labelFitRem: 4.5 },
  { key: 'tracking', width: 'minmax(8rem, 8rem)', label: 'Tracking', type: 'location', omitCellIcon: true, hideKey: 'tracking', labelFitRem: 4.5 },
  { key: 'serial', width: 'minmax(8rem, 8rem)', label: 'Serial', type: 'id', hideKey: 'serial', tier: 'optional', labelFitRem: 4.5 },
] as const;

/**
 * Frozen identity pane — `select · title`. Derived from the column model's
 * `frozen` flag (one declaration for freeze + immovability + offset math), not
 * from the house key list: the pane is a per-surface answer, and Orders already
 * freezes a third track. See `grid-column-editability.ts`.
 */
const RECEIVING_GRID_LOCKED_KEYS: readonly ReceivingGridColumnKey[] = gridFrozenKeys(RECEIVING_GRID_COLUMNS);

/** Data columns that support click-to-sort (excludes select). */
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


/** Default direction when first activating a column sort. */
export function defaultDirForReceivingGridSort(key: ReceivingGridColumnKey): GridSortDir {
  // Date / stage: most recent first (ops scan).
  if (key === 'date' || key === 'stage') return 'desc';
  return 'asc';
}

// (flipReceivingGridSortDir retired — the TanStack sort surface owns the
//  asc ↔ desc cycle via LedgerGridSurface / useGridSurface.)

// Shared spreadsheet chrome — same helpers as outbound OrdersGridView / Incoming.
export {
  ORDERS_QUEUE_FROZEN_CELL as RECEIVING_GRID_FROZEN_CELL,
  ordersQueueFrozenLeft as receivingGridFrozenLeft,
  ordersQueueGridCell as receivingGridCell,
  ordersQueueRowShellClass as receivingGridRowShellClass,
} from '@/lib/dashboard-order-row-layout';
