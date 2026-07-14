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

/**
 * Monitor card that hosts an internally sticky list (Packed / Shipped day bands).
 * Uses `overflow-x-clip` (NOT `overflow-hidden`) so sticky date headers can dock
 * to the scrollport without being trapped by a non-visible overflow ancestor.
 */
export const MONITOR_SECTION_CARD_SCROLL_CLASS = `${MONITOR_SECTION_CARD_CLASS} overflow-x-clip`;

/** Default padded section body used by Monitor `SectionCard` and shipped shells. */
export const MONITOR_SECTION_CARD_PADDED = `${MONITOR_SECTION_CARD_CLASS} p-5 sm:p-6`;

/** Compact KPI / metric tile padding. */
export const MONITOR_KPI_TILE_CLASS = `${MONITOR_SECTION_CARD_CLASS} p-4`;
