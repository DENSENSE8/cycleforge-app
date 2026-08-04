/**
 * Grid column identity pane — which tracks are frozen, and what that implies.
 *
 * The identity pane is the frozen prefix of a grid: pinned left while the fact
 * columns scroll, immovable under drag-reorder, and read-only in the collection
 * map (never mounts `LedgerCellEditor` — correction happens at the record
 * plane; see `display/workbench.md` → Action planes).
 *
 * **Membership is declared on the column model** (`frozen: true`), not by a
 * house-wide key list, because the pane is a per-surface answer to "what does
 * an operator scan first here". The **order-anchored** surfaces — Orders,
 * Receiving (Unbox / History / Testing) and Incoming — freeze
 * `select · order · title`: the order or PO is the container an operator
 * arrives by, read off a pick list, a carton label or a vendor email, so it has
 * to stay on screen while the fact columns scroll. Catalog / Repair / Pickup
 * freeze `select · title` — Catalog has no order context at all, and on the
 * other two the order is not what the row is found by (Repair quotes an RS-####
 * ticket; Pickup's order is already the group header).
 * {@link GRID_IDENTITY_COLUMN_KEYS} remains the house DEFAULT for that answer
 * and the key-only fallback for surfaces with no column model in hand.
 *
 * **Receiving exception (Sheets golden, 2026-08-04):** freeze `select` only —
 * Order / Product scroll. Operator-editable freeze panes are future work.
 * The pane must be a **contiguous prefix** of the canonical column order —
 * `gridFrozenLeft`-style offset math sums the widths of the frozen columns
 * before a given one, so a frozen column with a scrolling column ahead of it
 * would pin at the wrong origin. Pinned by the per-surface layout guards.
 */

/** House DEFAULT identity pane — frozen, immovable, never in-cell editable. */
export const GRID_IDENTITY_COLUMN_KEYS = ['select', 'title'] as const;

export type GridIdentityColumnKey = (typeof GRID_IDENTITY_COLUMN_KEYS)[number];

export function isGridIdentityColumn(key: string): boolean {
  return (GRID_IDENTITY_COLUMN_KEYS as readonly string[]).includes(key);
}

/**
 * May this column mount `LedgerCellEditor` / a cell focus ring on a collection
 * map? Identity columns always return false.
 *
 * Key-only by design: a cell renderer asks this without the column model in
 * hand. A surface that freezes MORE than the house default (Orders' `order`)
 * keeps its extra track read-only by simply not wiring an editor to it — the
 * check here is the floor, not the ceiling.
 */
export function isGridColumnInCellEditable(key: string): boolean {
  return !isGridIdentityColumn(key);
}

/**
 * Column types whose cell content has a FIXED rendered width, so a drag-resize
 * can only add or steal whitespace around it.
 *
 * **`number` only** (Sheets parity 2026-08): qty / short tabular numerals stay
 * fixed. Identifier (`id`) and `location` tracks are operator-resizable — the
 * chip face may still be last-8, but the *track* around it is adjustable so
 * operators can widen Order / Tracking / Loc the way they drag a Sheets column.
 *
 * Titles, conditions, statuses, platforms, dates, staff names remain variable
 * by type (not in this set).
 */
const FIXED_WIDTH_COLUMN_TYPES = new Set(['number']);

/**
 * Structural shape for the resize test — see the dependency note below.
 */
interface ResizableLike {
  key: string;
  type?: string;
  resizable?: boolean;
}

/**
 * May an operator drag this column's edge?
 *
 * Yes for variable-content tracks; no for the `select` gutter (it has no content
 * to fit) and for the fixed-format identifier / magnitude types above. An
 * explicit `resizable` on the column model wins, so a surface with a genuinely
 * variable `id` column can opt back in where it is declared — once, never per
 * header.
 *
 * The frozen identity pane IS resizable: `gridFrozenLeft` builds its sticky-left
 * offsets as a `calc()` over the same `--cf-col-*` vars the drag writes, so
 * pinned cells follow a resized `title` without extra machinery.
 */
export function isGridColumnResizable(column: ResizableLike): boolean {
  if (column.resizable != null) return column.resizable;
  if (column.key === 'select' || column.key === '_paint') return false;
  return !(column.type && FIXED_WIDTH_COLUMN_TYPES.has(column.type));
}

/**
 * Trailing structural filler (`_fill`) — absorbs leftover sheet width via
 * `minmax(0rem, 1fr)`. Not a fact column: empty header/body, never in Column
 * display, never sortable/resizable. Receiving (Unbox History) golden.
 */
export function isGridColumnFillTrack(column: { key: string }): boolean {
  return column.key === '_fill';
}

/**
 * Header-only row-paint chrome (`_paint`) — paint-bucket in the header; empty
 * body cell. Not a fact column, never sortable/resizable/Fields.
 */
export function isGridColumnPaintTrack(column: { key: string }): boolean {
  return column.key === '_paint';
}

/**
 * Structural, dependency-free by design — same reason as `grid-column-geometry`:
 * typing against the concrete `LedgerGridColumnModel` would import the
 * descriptor module, which imports THIS one. Every column model satisfies it.
 */
interface FrozenLike {
  key: string;
  frozen?: boolean;
}

/**
 * The surface's frozen identity keys, in canonical order — derived from the
 * column model so freeze, immovability, and the sticky-left offset math read
 * ONE declaration.
 *
 * This replaced six per-surface `[...GRID_IDENTITY_COLUMN_KEYS]` copies. They
 * were identical only because no surface had yet needed a different pane; the
 * first one that did (Orders, adding `order`) would otherwise have had to
 * either fork a page-local list or widen the house constant onto five surfaces
 * that have no order column.
 */
export function gridFrozenKeys<C extends FrozenLike>(columns: readonly C[]): C['key'][] {
  return columns.filter((c) => c.frozen).map((c) => c.key);
}
