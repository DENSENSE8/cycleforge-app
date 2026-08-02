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
 * an operator scan first here": Orders freezes `select · order · title` (the
 * order is the container and the scan anchor on a dispatch queue), while
 * Catalog / Receiving / Incoming / Repair / Pickup freeze `select · title`
 * (no order context, or the PO is secondary to the item being scanned).
 * {@link GRID_IDENTITY_COLUMN_KEYS} remains the house DEFAULT for that answer
 * and the key-only fallback for surfaces with no column model in hand.
 *
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
 * These are the identifier / magnitude tracks — serial, tracking, order id, SKU,
 * qty — and every one of them renders through the `CopyChip` family's last-8
 * preview or a short tabular numeral run. Their width is decided by the display
 * format, not by the data, which is why the house sizes them once in the column
 * SoT and does not offer a grip: dragging one wider produces a wider empty gutter
 * beside the same eight characters.
 *
 * Everything else — titles, conditions, statuses, platforms, dates, staff names —
 * has content whose length genuinely varies per row and per tenant, which is
 * exactly what a resize is for.
 */
const FIXED_WIDTH_COLUMN_TYPES = new Set(['number', 'id', 'location']);

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
  if (column.key === 'select') return false;
  return !(column.type && FIXED_WIDTH_COLUMN_TYPES.has(column.type));
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
