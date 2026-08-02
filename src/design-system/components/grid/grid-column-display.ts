/**
 * Per-staff column display prefs — highlight wash + cell chrome mode.
 * Keys are `hideKey` values (same vocabulary as Fields visibility).
 */

export type GridColumnHighlight = 'none' | 'blue' | 'amber' | 'rose' | 'emerald';
export type GridColumnCellMode = 'default' | 'chip';

export type GridColumnDisplayPref = {
  highlight?: GridColumnHighlight;
  cell?: GridColumnCellMode;
};

/** House tone washes for a full column track — no page-local hex. */
const HIGHLIGHT_CLASS: Record<Exclude<GridColumnHighlight, 'none'>, string> = {
  blue: 'bg-blue-50',
  amber: 'bg-amber-50',
  rose: 'bg-rose-50',
  emerald: 'bg-emerald-50',
};

export function gridColumnHighlightClass(
  highlight?: GridColumnHighlight | null,
): string | undefined {
  if (!highlight || highlight === 'none') return undefined;
  return HIGHLIGHT_CLASS[highlight];
}

/** Compact pill wrap for `cell: 'chip'` primary values. */
export const GRID_COLUMN_CHIP_VALUE_CLASS =
  'inline-flex max-w-full min-w-0 truncate rounded-md bg-surface-sunken px-1.5 py-0.5 text-role-caption font-semibold text-text-default';
