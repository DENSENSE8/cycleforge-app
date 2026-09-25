/**
 * Weight ladder — capped at 600 (2026-07-28, contextual-font-system).
 *
 * `bold` (700), `heavy` (800), and `black` (900) were retired. At the sizes this
 * UI actually renders (10–14px on 1080p warehouse monitors) heavy weights bleed
 * counters shut and cost legibility instead of buying hierarchy. Hierarchy here
 * comes from color contrast, tracking, and the role scale — not from ink.
 *
 * The sans and condensed 700 cuts are not loaded by `next/font`
 * (`src/lib/fonts.ts`), so asking for one renders the 600 cut. Exception: IBM
 * Plex Mono loads 700 (owner 2026-09-25, BRIEF §4 industrial — mono labels and
 * IDs are heavy); mono `font-bold` renders a real 700.
 */
export const fontWeights = {
  regular: 400,
  medium: 500,
  semibold: 600,
} as const;

export type FontWeights = typeof fontWeights;

/** The hard ceiling. Nothing in the UI may resolve above this. */
export const MAX_FONT_WEIGHT = 600;
