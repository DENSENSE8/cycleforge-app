/** Ledger grid column GEOMETRY — track width, header fit, content floor, and the CSS grid template. */

import { gridFrozenKeys, isGridColumnFillTrack } from './grid-column-editability';

/** Structural, dependency-free by design. */
interface TrackLike {
  width: string;
}
interface HeaderLike extends TrackLike {
  key: string;
  label?: string;
  gridLabel?: string;
  labelFitRem?: number;
  headerGlyphOnly?: boolean;
  headerForceLabel?: boolean;
  type?: string;
}
interface FrozenTrackLike extends TrackLike {
  key: string;
  frozen?: boolean;
}

/**
 * CSS custom property that overrides a column's track width (px), keyed by the
 * column key. Set on the grid surface; header + rows + group summaries inherit
 * it, which is what keeps a drag-resize in sync across all three.
 */
/** Column keys are not all valid CSS ident tails. */
function cssIdentTail(key: string): string {
  return key.replace(/[^A-Za-z0-9_-]/g, '-');
}

export function gridColVar(key: string): string {
  return `--cf-col-${cssIdentTail(key)}`;
}

/** The column's rem floor, parsed from its `minmax(Xrem, …)` track. */
function gridColumnTrackRem(column: TrackLike): number {
  const m = column.width.match(/([\d.]+)rem/);
  return m ? Number(m[1]) : 12;
}

/** Should this header render its text label, or fall back to the type glyph? */
export function gridHeaderShowsLabel(column: HeaderLike, label?: string): boolean {
  if (column.headerGlyphOnly) return false;
  if (column.headerForceLabel) return true;
  if (column.key === 'thumb' || column.type === 'image') return false;
  if (isFlexTrack(column)) return true;
  const trackRem = gridColumnTrackRem(column);
  if (trackRem < (column.labelFitRem ?? 4.5)) return false;
  return gridHeaderLabelFits(trackRem, label ?? column.gridLabel ?? column.label ?? column.key);
}

/** Sum of the visible tracks' rem floors — the surface's h-scroll activation width. */
export function gridContentMinWidthRem(columns: readonly TrackLike[]): number {
  return columns.reduce((sum, c) => sum + gridColumnTrackRem(c), 0);
}

interface KeyedTrackLike extends TrackLike {
  key: string;
}

/** Live content-min width in px — SoT rem floors, with persisted drag-resize px overrides replacing the rem for that track. */
export function gridContentMinWidthPx(
  columns: readonly KeyedTrackLike[],
  widths: Readonly<Record<string, number>> = {},
  remPx = 16,
): number {
  return columns.reduce((sum, c) => {
    // Trailing `_fill` absorbs slack — never part of the scroll activation floor.
    if (isGridColumnFillTrack(c)) return sum;
    const override = widths[c.key];
    if (typeof override === 'number' && Number.isFinite(override) && override > 0) {
      return sum + override;
    }
    return sum + gridColumnTrackRem(c) * remPx;
  }, 0);
}

/**
 * Rem length scaled by spreadsheet / compact density (`--cf-density`).
 * Zoom hosts set the same var (see {@link gridZoomStyle}); default `1` leaves
 * SoT rem floors unchanged. Staff px overrides (`--cf-col-*`) stay absolute.
 */
export function densityScaledRem(rem: number): string {
  return `calc(${rem}rem * var(--cf-density, 1))`;
}

/** `grid-template-columns` for the visible tracks, each overridable by its per-column CSS var so a resize updates header, rows and… */
export function gridTemplate(columns: readonly (TrackLike & { key: string })[]): string {
  return columns
    .map((c) => {
      const floor = densityScaledRem(gridColumnTrackRem(c));
      return isFlexTrack(c)
        ? `minmax(var(${gridColVar(c.key)}, ${floor}), 1fr)`
        : `var(${gridColVar(c.key)}, ${floor})`;
    })
    .join(' ');
}

/** A track that absorbs the surface's leftover width (declared `…, 1fr)`). */
function isFlexTrack(column: TrackLike): boolean {
  return column.width.includes('1fr');
}

/** The row's own left inset (`QUEUE_ROW.px` = `px-3`, density-aware). */
const GRID_ROW_PX = 'var(--cf-queue-row-px, calc(0.75rem * var(--cf-density, 1)))';

/** Sticky-`left` offset for a frozen cell — the row inset plus the width vars of the frozen columns *before* it, so the pane pins on its… */
export function gridFrozenLeft(columns: readonly FrozenTrackLike[], key: string): string {
  const frozen = gridFrozenKeys(columns);
  const idx = frozen.indexOf(key);
  const parts = [GRID_ROW_PX];
  for (const k of frozen.slice(0, Math.max(0, idx))) {
    const col = columns.find((c) => c.key === k);
    parts.push(
      `var(${gridColVar(k)}, ${col ? densityScaledRem(gridColumnTrackRem(col)) : '0px'})`,
    );
  }
  return `calc(${parts.join(' + ')})`;
}

/** Does a header's resolved label fit its track, or must it degrade to the type glyph? */
const HEADER_CHAR_REM = 0.42;
const HEADER_CHROME_REM = 2;

function gridHeaderLabelFits(trackRem: number, label: string): boolean {
  return trackRem >= label.trim().length * HEADER_CHAR_REM + HEADER_CHROME_REM;
}
