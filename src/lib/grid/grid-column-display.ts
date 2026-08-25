/**
 * Per-staff column display prefs — highlight wash + cell chrome + text emphasis.
 * Keys are `hideKey` values (same vocabulary as Fields visibility).
 *
 * Highlight is a free `#rrggbb` (Sheets-style any color). Legacy named washes
 * (`blue` / `amber` / `rose` / `emerald`) still normalize on read so older
 * staff prefs keep their look.
 *
 * Text emphasis is a **named semantic mode** only (never free hex) — house law
 * forbids freeform per-cell text swatches; column-level token classes are the
 * Sheets "text color" adaptation for Unbox triage.
 */

import type { CSSProperties } from 'react';

/** Persisted highlight — `#rrggbb`, or absent / `'none'` for no wash. */
export type GridColumnHighlight = string;

export type GridColumnCellMode = 'default' | 'chip';

/**
 * Named text emphasis for a whole column. Maps to semantic token classes —
 * never a free `#rrggbb`.
 */
export type GridColumnTextEmphasis =
  | 'default'
  | 'muted'
  | 'emphasis'
  | 'warning'
  | 'critical';

export const GRID_COLUMN_TEXT_EMPHASIS_OPTS: ReadonlyArray<{
  id: GridColumnTextEmphasis;
  label: string;
}> = [
  { id: 'default', label: 'Default' },
  { id: 'muted', label: 'Muted' },
  { id: 'emphasis', label: 'Strong' },
  { id: 'warning', label: 'Warning' },
  { id: 'critical', label: 'Critical' },
];

const TEXT_EMPHASIS_SET = new Set<GridColumnTextEmphasis>(
  GRID_COLUMN_TEXT_EMPHASIS_OPTS.map((o) => o.id),
);

export function normalizeGridColumnTextEmphasis(
  raw?: string | null,
): GridColumnTextEmphasis | null {
  if (!raw || raw === 'default') return null;
  return TEXT_EMPHASIS_SET.has(raw as GridColumnTextEmphasis)
    ? (raw as GridColumnTextEmphasis)
    : null;
}

/** Tailwind text-color class for a column emphasis (empty for default). */
export function gridColumnTextEmphasisClass(
  text?: GridColumnTextEmphasis | null,
): string {
  switch (text) {
    case 'muted':
      return 'text-text-muted';
    case 'emphasis':
      return 'font-semibold text-text-default';
    case 'warning':
      return 'text-amber-700';
    case 'critical':
      return 'text-rose-700';
    default:
      return '';
  }
}

export type GridColumnDisplayPref = {
  highlight?: GridColumnHighlight;
  cell?: GridColumnCellMode;
  text?: GridColumnTextEmphasis;
};

/** Legacy named washes → Tailwind `*-50` hex equivalents. */
export const LEGACY_GRID_COLUMN_HIGHLIGHT_HEX = {
  blue: '#eff6ff',
  amber: '#fffbeb',
  rose: '#fff1f2',
  emerald: '#ecfdf5',
} as const satisfies Record<string, `#${string}`>;

export type LegacyGridColumnHighlight = keyof typeof LEGACY_GRID_COLUMN_HIGHLIGHT_HEX;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Sheets-like light fill presets (includes the four legacy washes). Shared by column + row paint. */
export const GRID_HIGHLIGHT_PRESETS: ReadonlyArray<{ hex: string; label: string }> = [
  { hex: LEGACY_GRID_COLUMN_HIGHLIGHT_HEX.blue, label: 'Blue' },
  { hex: LEGACY_GRID_COLUMN_HIGHLIGHT_HEX.amber, label: 'Amber' },
  { hex: LEGACY_GRID_COLUMN_HIGHLIGHT_HEX.rose, label: 'Rose' },
  { hex: LEGACY_GRID_COLUMN_HIGHLIGHT_HEX.emerald, label: 'Emerald' },
  { hex: '#fef3c7', label: 'Gold' },
  { hex: '#fce7f3', label: 'Pink' },
  { hex: '#e0e7ff', label: 'Indigo' },
  { hex: '#ccfbf1', label: 'Teal' },
  { hex: '#f3f4f6', label: 'Gray' },
  { hex: '#fee2e2', label: 'Red' },
];

/**
 * Normalize a stored / UI highlight to a `#rrggbb` or `null` (none).
 * Accepts legacy named tokens and `'none'`.
 */
export function normalizeGridColumnHighlight(
  highlight?: string | null,
): string | null {
  if (!highlight || highlight === 'none') return null;
  const legacy = LEGACY_GRID_COLUMN_HIGHLIGHT_HEX[highlight as LegacyGridColumnHighlight];
  if (legacy) return legacy;
  if (HEX_RE.test(highlight)) return highlight.toLowerCase();
  return null;
}

/** True when the value should be persisted (non-default wash). */
export function isPersistedGridColumnHighlight(highlight?: string | null): boolean {
  return normalizeGridColumnHighlight(highlight) != null;
}

/**
 * Inline style for a column-track wash. Staff-chosen hex is prefs data —
 * not a banned page-local brand token.
 */
export function gridColumnHighlightStyle(
  highlight?: string | null,
): CSSProperties | undefined {
  const hex = normalizeGridColumnHighlight(highlight);
  if (!hex) return undefined;
  return { backgroundColor: hex };
}

/** Compact pill wrap for `cell: 'chip'` primary values. */
export const GRID_COLUMN_CHIP_VALUE_CLASS =
  'inline-flex max-w-full min-w-0 truncate rounded-md bg-surface-sunken px-1.5 py-0.5 text-role-caption font-semibold text-text-default';
