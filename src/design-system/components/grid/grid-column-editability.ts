/** Grid column identity pane — which tracks are frozen, and what that implies. */

/** House DEFAULT identity pane — frozen and immovable. */
export const GRID_IDENTITY_COLUMN_KEYS = ['select', 'title'] as const;

export function isGridIdentityColumn(key: string): boolean {
  return (GRID_IDENTITY_COLUMN_KEYS as readonly string[]).includes(key);
}

/** Column types whose cell content has a FIXED rendered width, so a drag-resize can only add or steal whitespace around it. */
const FIXED_WIDTH_COLUMN_TYPES = new Set(['number', 'price']);

/**
 * Structural shape for the resize test — see the dependency note below.
 */
interface ResizableLike {
  key: string;
  type?: string;
  resizable?: boolean;
}

/** May an operator drag this column's edge? */
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

/** The surface's frozen identity keys, in canonical order — derived from the column model so freeze, immovability, and the sticky-left… */
export function gridFrozenKeys<C extends FrozenLike>(columns: readonly C[]): C['key'][] {
  return columns.filter((c) => c.frozen).map((c) => c.key);
}

/** A FLUSH track — zero cell inset, contents edge to edge. */
export function isGridColumnFlushTrack(column: { key: string }): boolean {
  return column.key === 'select' || column.key === 'thumb';
}
