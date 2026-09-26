/** The highlight vocabulary shared by every staff-chosen wash. */

/** Persisted highlight — `#rrggbb`, or absent / `'none'` for no wash. */
export type GridColumnHighlight = string;

/** Legacy named washes → Tailwind `*-50` hex equivalents. */
export const LEGACY_GRID_COLUMN_HIGHLIGHT_HEX = {
  blue: '#eff6ff',
  amber: '#fffbeb',
  rose: '#fff1f2',
  emerald: '#ecfdf5',
} as const satisfies Record<string, `#${string}`>;

export type LegacyGridColumnHighlight = keyof typeof LEGACY_GRID_COLUMN_HIGHLIGHT_HEX;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Sheets-like light fill presets (includes the four legacy washes). Row paint. */
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
