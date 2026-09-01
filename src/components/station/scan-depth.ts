/**
 * Scan-station depth — shared well / plate / slot recipe.
 *
 * Classes consume `--ds-station-*` (see station-skins.ts). Industrial is the
 * default mill: strong well, accent plate, emphasis/canvas bevels. Packing
 * bench, coal, and every catalog skin remap the same classes. Import these.
 * Do not retype `bg-surface-sunken` on a station centre.
 */

/** Ply lines — painted only when the active skin sets `grain`. */
export const STATION_SCAN_GRAIN_CLASS = 'station-scan-grain';

/** Inset bevel — hole. Shadow lip top/left, highlight floor bottom/right. */
export const STATION_SCAN_INSET_BEVEL_CLASS =
  'border-2 border-t-border-station-shadow border-l-border-station-shadow border-b-border-station-highlight border-r-border-station-highlight';

/** Raised bevel — plate. Highlight top/left, shadow thickness bottom/right. */
export const STATION_SCAN_RAISED_BEVEL_CLASS =
  'border-2 border-t-border-station-highlight border-l-border-station-highlight border-b-border-station-shadow border-r-border-station-shadow';

/** Band header strip. Industrial is transparent; bench/coal paint a face. */
export const STATION_SCAN_BENCH_CLASS =
  `bg-surface-station-header ${STATION_SCAN_GRAIN_CLASS}`;

/** Recessed open-body well (band interiors, Arrival door-flow, Pack list). */
export const STATION_SCAN_WELL_CLASS =
  `bg-surface-station-well ${STATION_SCAN_GRAIN_CLASS} ${STATION_SCAN_INSET_BEVEL_CLASS}`;

/**
 * Flush capture-field / empty-cube slot. Deeper than the well. Do not paint
 * this on the whole capture bar.
 */
export const STATION_SCAN_FIELD_WELL_CLASS =
  `bg-surface-station-slot ${STATION_SCAN_GRAIN_CLASS} ${STATION_SCAN_INSET_BEVEL_CLASS}`;

/**
 * Working row — raised plate. Idle rows stay transparent so the well shows
 * through.
 */
export const STATION_SCAN_ACTIVE_WELL_CLASS =
  `bg-surface-station-plate ${STATION_SCAN_RAISED_BEVEL_CLASS}`;
