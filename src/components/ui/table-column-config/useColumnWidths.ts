/**
 * Column width clamp helpers for drag-resize handles.
 *
 * Live per-staff width persistence (`useColumnWidths`) was retired with
 * `OrdersQueueTable` — outbound lists use SoT default tracks on LedgerGrid.
 * Keep the clamp constants here so {@link ColumnResizeHandle} (opt-in when a
 * surface wires `onResizeColumn`) still shares the same floor/ceiling.
 */

/** Clamp any drag-resized column to a sane px range.
 *  64px floor keeps short labels (Qty / Cond / Age / Order) readable. */
export const COLUMN_WIDTH_MIN = 64;
const COLUMN_WIDTH_MAX = 720;

export function clampColumnWidth(px: number): number {
  return Math.max(COLUMN_WIDTH_MIN, Math.min(COLUMN_WIDTH_MAX, Math.round(px)));
}
