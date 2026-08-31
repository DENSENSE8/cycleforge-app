/**
 * Grid column identity pane — which tracks are frozen, and what that implies.
 *
 * The identity pane is the frozen prefix of a grid: pinned left while the fact
 * columns scroll and immovable under drag-reorder. Every cell in the collection
 * map is read-only — correction happens at the record plane.
 *
 * **Membership is declared on the column model** (`frozen: true`), not by a
 * house-wide key list, because the pane is a per-surface answer to "what does
 * an operator scan first here". The **order-anchored** surfaces — Orders
 * freezes `select · order · age · title`; Receiving (Unbox / History / Testing)
 * freezes `select · order`; Incoming freezes `select` only. Catalog / Repair /
 * Pickup freeze `select · title` — Catalog has no order context at all, and on
 * the other two the order is not what the row is found by (Repair quotes an
 * RS-#### ticket; Pickup's order is already the group header).
 * {@link GRID_IDENTITY_COLUMN_KEYS} remains the house DEFAULT for that answer
 * and the key-only fallback for surfaces with no column model in hand.
 *
 * **Receiving (Unbox / History / Testing, 2026-08-05):** freeze `select · order`
 * — PO stays pinned; Date / Product / Status / facts scroll.
 * **Orders / To Ship (2026-08-05):** freeze `select · order · age · title` —
 * Late stays beside Order (urgency before the long title); Product is the
 * frozen-edge hard track and the only `resizable: true` column.
 * Incoming stays select-only (Sheets golden). Operator-editable freeze panes
 * are future work. The pane must be a **contiguous prefix** of the canonical
 * column order — `gridFrozenLeft`-style offset math sums the widths of the
 * frozen columns before a given one, so a frozen column with a scrolling
 * column ahead of it would pin at the wrong origin. Pinned by the per-surface
 * layout guards.
 */

/** House DEFAULT identity pane — frozen and immovable. */
export const GRID_IDENTITY_COLUMN_KEYS = ['select', 'title'] as const;

export function isGridIdentityColumn(key: string): boolean {
  return (GRID_IDENTITY_COLUMN_KEYS as readonly string[]).includes(key);
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
const FIXED_WIDTH_COLUMN_TYPES = new Set(['number', 'price']);

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
 * display, never sortable/resizable. Orders + Receiving (Unbox History) consumers.
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

/**
 * A FLUSH track — zero cell inset, contents edge to edge.
 *
 * The compound row's two gutters (`select` · `thumb`): a 48px checkmark square
 * and a 48px photo, both asked to run corner to corner with no padding. Every
 * other track keeps the spreadsheet's `px-2` so its text does not touch the
 * column rule.
 *
 * Declared here beside {@link isGridColumnFillTrack} / {@link isGridColumnPaintTrack}
 * so the header and the body cell read ONE answer. They diverged once already
 * on exactly this kind of question — a header that insets a track whose body
 * does not puts the column rule and the sort affordance at a different x than
 * the cells beneath them, which is visible as a wobble down the whole grid.
 */
export function isGridColumnFlushTrack(column: { key: string }): boolean {
  return column.key === 'select' || column.key === 'thumb';
}
