/**
 * Column width clamp helpers for drag-resize handles.
 *
 * Live per-staff width persistence (`useColumnWidths`) was retired with
 * `OrdersQueueTable` — outbound lists use SoT default tracks on LedgerGrid.
 * Keep the clamp constants here so {@link ColumnResizeHandle} (opt-in when a
 * surface wires `onResizeColumn`) still shares the same floor/ceiling.
 */

/** Clamp any drag-resized column to a sane px range.
 *  64px floor keeps short labels (Qty / Cond / Age / Order) readable.
 *  Pass `minPx` for a typed track floor (e.g. stamp-face date → 12rem). */
const COLUMN_WIDTH_MIN = 64;
const COLUMN_WIDTH_MAX = 720;

export function clampColumnWidth(px: number, minPx: number = COLUMN_WIDTH_MIN): number {
  const floor = Math.max(COLUMN_WIDTH_MIN, minPx);
  return Math.max(floor, Math.min(COLUMN_WIDTH_MAX, Math.round(px)));
}
