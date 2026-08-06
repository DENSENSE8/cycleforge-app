/**
 * Column width clamp helpers for drag-resize handles and Columns Display
 * numeric width / min / max fields.
 *
 * Live per-staff width persistence (`useColumnWidths`) was retired with
 * `OrdersQueueTable` — outbound lists use SoT default tracks on LedgerGrid.
 * Keep the clamp constants here so {@link ColumnResizeHandle} (opt-in when a
 * surface wires `onResizeColumn`) still shares the same floor/ceiling.
 */

/** House absolute floor — short labels (Qty / Cond / Age / Order) stay readable. */
export const COLUMN_WIDTH_MIN = 64;
/** Default ceiling when staff has not set a per-column max (preserves drag feel). */
export const COLUMN_WIDTH_MAX = 720;
/** Schema / absolute ceiling — staff max cannot exceed this. */
export const COLUMN_WIDTH_ABSOLUTE_MAX = 2000;

export type ColumnWidthBound = {
  min?: number;
  max?: number;
};

/**
 * Resolve the effective min/max px clamp for a column.
 *
 * Floor = max(64, typedTrackFloorPx, staffMin).
 * Ceiling = min(2000, staffMax ?? 720). Always `maxPx >= minPx`.
 */
export function resolveColumnWidthClamp(opts: {
  typedFloorPx?: number;
  staffMin?: number;
  staffMax?: number;
}): { minPx: number; maxPx: number } {
  const typed = opts.typedFloorPx != null && opts.typedFloorPx > 0 ? opts.typedFloorPx : 0;
  const staffMin =
    opts.staffMin != null && Number.isFinite(opts.staffMin) ? opts.staffMin : 0;
  const minPx = Math.max(COLUMN_WIDTH_MIN, typed, staffMin);
  const staffMax =
    opts.staffMax != null && Number.isFinite(opts.staffMax)
      ? opts.staffMax
      : COLUMN_WIDTH_MAX;
  const maxPx = Math.max(minPx, Math.min(COLUMN_WIDTH_ABSOLUTE_MAX, staffMax));
  return { minPx, maxPx };
}

/**
 * Clamp any drag-resized / panel-committed column width to a sane px range.
 * Pass `minPx` for the resolved floor (typed + staff); `maxPx` for the
 * resolved ceiling (default house 720).
 */
export function clampColumnWidth(
  px: number,
  minPx: number = COLUMN_WIDTH_MIN,
  maxPx: number = COLUMN_WIDTH_MAX,
): number {
  const lo = Math.max(COLUMN_WIDTH_MIN, minPx);
  const hi = Math.max(lo, Math.min(COLUMN_WIDTH_ABSOLUTE_MAX, maxPx));
  return Math.max(lo, Math.min(hi, Math.round(px)));
}
