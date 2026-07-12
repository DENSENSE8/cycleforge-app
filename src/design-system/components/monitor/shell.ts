/**
 * Shared Monitor card shell tokens.
 *
 * Theme-driven only (`bg-surface-card`, `border-border-soft`) so light/dark and
 * other palettes restyle without page-local hex. See
 * `.claude/rules/display/monitor-rollup-blocks.md`.
 */

/** Outer bubble — raised card on `bg-surface-canvas`. */
export const MONITOR_SECTION_CARD_CLASS =
  'rounded-2xl border border-border-soft bg-surface-card shadow-sm';

/** Default padded section body used by Monitor `SectionCard` and shipped shells. */
export const MONITOR_SECTION_CARD_PADDED = `${MONITOR_SECTION_CARD_CLASS} p-5 sm:p-6`;

/** Compact KPI / metric tile padding. */
export const MONITOR_KPI_TILE_CLASS = `${MONITOR_SECTION_CARD_CLASS} p-4`;
