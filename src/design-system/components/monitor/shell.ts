/**
 * Shared Monitor card shell tokens.
 *
 * Theme-driven only (`bg-surface-card`, `border-border-soft`) so light/dark and
 * other palettes restyle without page-local hex. See
 *
 * Two KPI altitudes:
 * - {@link MONITOR_KPI_TILE_CLASS} — Monitor / analytics **cards** (rounded-2xl p-4)
 * - {@link MONITOR_KPI_BAND_CLASS} — workbench Band 2 **instrument** (flush, no card shell)
 */

import { cornerClass } from '@/design-system/tokens/radius';

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

/** Compact KPI / metric tile padding — analytics Monitor cards. */
export const MONITOR_KPI_TILE_CLASS = `${MONITOR_SECTION_CARD_CLASS} p-4`;

/**
 * Workbench Band 2 KPI face — flush industrial instrument (no card island).
 * Compose via {@link KpiTile} `density="band"`; do not use inside Monitor dashboards.
 */
export const MONITOR_KPI_BAND_CLASS = [
  cornerClass('flush'),
  'border-0 bg-transparent p-0 shadow-none',
  'px-2 py-1',
].join(' ');

/** Flex strip for Band 2 attention tiles — single-row prefer, wrap when needed.
 *  Light vertical hairlines between sibling cells (`border-border-hairline`). */
export const MONITOR_KPI_BAND_STRIP_CLASS =
  'flex flex-wrap gap-0 [&>*:not(:last-child)]:border-r [&>*:not(:last-child)]:border-border-hairline';

/** Cell basis for Band 2 tiles — denser than card `basis-40`. */
export const MONITOR_KPI_BAND_CELL_CLASS = 'min-w-0 grow basis-28 sm:basis-32';
