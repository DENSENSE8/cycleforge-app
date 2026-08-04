/**
 * Spreadsheet zoom for LedgerGrid hosts — discrete steps via CSS var, never
 * `transform: scale()` (blurs text and breaks resize hit targets).
 *
 * Hosts set `--cf-grid-zoom` on a wrapper; {@link grid-column-geometry} and
 * density-aware chrome already multiply through `--cf-density`. Zoom multiplies
 * density so row height + type scale together.
 */

export const GRID_ZOOM_LEVELS = [80, 90, 100, 110, 125] as const;

export type GridZoomPercent = (typeof GRID_ZOOM_LEVELS)[number];

export const GRID_ZOOM_DEFAULT: GridZoomPercent = 100;

const GRID_ZOOM_STORAGE_KEY = 'cf.gridZoom.receiving';

export function parseGridZoom(
  raw: string | number | null | undefined,
): GridZoomPercent {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return GRID_ZOOM_DEFAULT;
  const nearest = GRID_ZOOM_LEVELS.reduce((best, level) =>
    Math.abs(level - n) < Math.abs(best - n) ? level : best,
  );
  return nearest;
}

function gridZoomFactor(percent: GridZoomPercent): number {
  return percent / 100;
}

/** Inline style bag for a zoom host wrapper. */
export function gridZoomStyle(
  percent: GridZoomPercent,
): Record<string, string> {
  const factor = gridZoomFactor(percent);
  return {
    '--cf-grid-zoom': String(factor),
    // Density multiplies existing `var(--cf-density, 1)` consumers.
    '--cf-density': String(factor),
  };
}

export function stepGridZoom(
  current: GridZoomPercent,
  direction: 1 | -1,
): GridZoomPercent {
  const idx = GRID_ZOOM_LEVELS.indexOf(current);
  const next = Math.max(0, Math.min(GRID_ZOOM_LEVELS.length - 1, idx + direction));
  return GRID_ZOOM_LEVELS[next]!;
}

export function readStoredGridZoom(): GridZoomPercent {
  if (typeof window === 'undefined') return GRID_ZOOM_DEFAULT;
  try {
    return parseGridZoom(window.localStorage.getItem(GRID_ZOOM_STORAGE_KEY));
  } catch {
    return GRID_ZOOM_DEFAULT;
  }
}

export function writeStoredGridZoom(percent: GridZoomPercent): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(GRID_ZOOM_STORAGE_KEY, String(percent));
  } catch {
    /* ignore quota */
  }
}
