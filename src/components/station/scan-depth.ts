/**
 * Scan-station depth — shared well / plate / slot / Displays column recipe.
 *
 * Classes consume `--ds-station-*` Color fills (see station-skins.ts) and
 * `--ds-station-bevel-width` from Depth (see station-depths.ts). Industrial +
 * Mill are the defaults. Import these. Do not retype `bg-surface-sunken` on a
 * station centre, and do not use desk `DETAIL_STACK_PUSH_COLUMN_CLASS` for the
 * scan Displays column.
 */

/** Ply lines — painted only when Depth is Deep (`data-station-depth='deep'`). */
export const STATION_SCAN_GRAIN_CLASS = 'station-scan-grain';

/** Bevel thickness from Depth axis (`flat` = 0, `mill` = 2px, `deep` = 4px). */
const STATION_BEVEL_WIDTH_CLASS =
  'border-[length:var(--ds-station-bevel-width)]';

/** Inset bevel — hole. Shadow lip top/left, highlight floor bottom/right. */
export const STATION_SCAN_INSET_BEVEL_CLASS =
  `${STATION_BEVEL_WIDTH_CLASS} border-t-border-station-shadow border-l-border-station-shadow border-b-border-station-highlight border-r-border-station-highlight`;

/** Raised bevel — plate. Highlight top/left, shadow thickness bottom/right. */
export const STATION_SCAN_RAISED_BEVEL_CLASS =
  `${STATION_BEVEL_WIDTH_CLASS} border-t-border-station-highlight border-l-border-station-highlight border-b-border-station-shadow border-r-border-station-shadow`;

/** Leading lip for a side slab (Displays column / parked strip). */
export const STATION_DISPLAYS_LEADING_BEVEL_CLASS =
  `border-l-[length:var(--ds-station-bevel-width)] border-l-border-station-shadow`;

/** Band header strip. Industrial is transparent; character Color paints a face. */
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

/**
 * Open Displays push column — station bar + grain + leading bevel.
 * Scan-only. Do not use desk {@link DETAIL_STACK_PUSH_COLUMN_CLASS}.
 */
export const STATION_DISPLAYS_COLUMN_CLASS =
  `relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden bg-surface-station-bar ${STATION_SCAN_GRAIN_CLASS} ${STATION_DISPLAYS_LEADING_BEVEL_CLASS}`;

/**
 * Parked Displays / utility strip (`w-8`) — twin of the open column edge.
 * Scan-only.
 */
export const STATION_DISPLAYS_STRIP_CLASS =
  `relative flex h-full w-8 shrink-0 flex-col items-center self-stretch bg-surface-station-bar ${STATION_SCAN_GRAIN_CLASS} ${STATION_DISPLAYS_LEADING_BEVEL_CLASS} hover:bg-surface-station-header-hover`;

/** Displays top band fill — compose with shared geometry `STATION_DISPLAYS_PUSH_TOP_BAND`. */
export const STATION_DISPLAYS_BAND_CLASS = STATION_SCAN_BENCH_CLASS;
