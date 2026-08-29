/**
 * Spreadsheet zoom for LedgerGrid hosts — discrete steps via CSS var, never
 * `transform: scale()` (blurs text and breaks resize hit targets).
 *
 * Hosts set `--cf-density` (and mirror `--cf-grid-zoom`) on a wrapper. Track
 * rem floors, frozen sticky offsets, and content-min rem all multiply through
 * `--cf-density` in {@link grid-column-geometry} / {@link ledgerGridWidthVarValue}
 * so 80% zoom shrinks columns with type — not only padding inside fixed rem.
 */

export const GRID_ZOOM_LEVELS = [80, 90, 100, 110, 125] as const;

export type GridZoomPercent = (typeof GRID_ZOOM_LEVELS)[number];

export const GRID_ZOOM_DEFAULT: GridZoomPercent = 100;

/**
 * Per-surface storage key.
 *
 * This was a single `cf.gridZoom.receiving` const until 2026-08-29 — zoom
 * existed but only Unbox / History could reach it, and every other sheet would
 * have shared receiving's level had one been wired up. Zoom is a property of the
 * SHEET an operator is looking at (a dense orders queue and a photo-bearing
 * receiving list want different levels on the same monitor), so the key carries
 * the `tableId`.
 *
 * The old key is read as the fallback for `receiving` so nobody's existing zoom
 * resets on deploy.
 */
export function gridZoomStorageKey(tableId: string): string {
  return `cf.gridZoom.${tableId}`;
}

const LEGACY_RECEIVING_ZOOM_KEY = 'cf.gridZoom.receiving';

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

export function readStoredGridZoom(tableId = 'receiving'): GridZoomPercent {
  if (typeof window === 'undefined') return GRID_ZOOM_DEFAULT;
  try {
    const stored = window.localStorage.getItem(gridZoomStorageKey(tableId));
    if (stored != null) return parseGridZoom(stored);
    // One-time fallback: receiving's zoom predates the per-surface key.
    if (tableId === 'receiving') {
      return parseGridZoom(window.localStorage.getItem(LEGACY_RECEIVING_ZOOM_KEY));
    }
    return GRID_ZOOM_DEFAULT;
  } catch {
    return GRID_ZOOM_DEFAULT;
  }
}

export function writeStoredGridZoom(percent: GridZoomPercent, tableId = 'receiving'): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(gridZoomStorageKey(tableId), String(percent));
  } catch {
    /* ignore quota */
  }
}
