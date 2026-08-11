/**
 * Incoming POS spreadsheet column model — SoT for `/incoming` LedgerGrid.
 *
 * Same spreadsheet family as Pending, plus a receiving-specific Status track
 * (delivery_state + confidence chips):
 *   select · title · date · age · qty · cond · status · platform · order · tracking
 *
 * Receiving-specific facts map onto Pending tracks (expected date, delivery age,
 * PO as order). Status stays its own column — never folded into Product Title.
 */

import { gridFrozenKeys } from '@/design-system/components/grid/grid-column-editability';
import {
  gridColumnTrackRem,
  gridContentMinWidthRem,
  gridHeaderShowsLabel,
  gridFrozenLeft,
  gridTemplate,
} from '@/design-system/components/grid/grid-column-geometry';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import { SHARED_LINE_TRACK_META } from '@/lib/receiving/shared-line-tracks';

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
  { key: 'order', width: 'minmax(7rem, 7rem)', ...SHARED_LINE_TRACK_META.order },
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
  // (delivery_state) stays Incoming's own (`IncomingGridStatusCell`).
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

// Shared spreadsheet chrome — @/design-system/components/grid ledgerGridCell.
export {
  LEDGER_GRID_FROZEN_CELL as INCOMING_GRID_FROZEN_CELL,
  ledgerGridCell as incomingGridCell,
  ledgerGridRowShellClass as incomingGridRowShellClass,
} from '@/design-system/components/grid/grid-cell-chrome';
