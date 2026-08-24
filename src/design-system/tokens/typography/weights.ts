/**
 * Weight ladder — capped at 600 (2026-07-28, contextual-font-system).
 *
 * `bold` (700), `heavy` (800), and `black` (900) were retired. At the sizes this
 * UI actually renders (10–14px on 1080p warehouse monitors) heavy weights bleed
 * counters shut and cost legibility instead of buying hierarchy. Hierarchy here
 * comes from color contrast, tracking, and the role scale — not from ink.
 *
 * The 700 cut is no longer loaded by `next/font` (`src/lib/fonts.ts`), so
 * asking for one only gets a synthesized faux-bold. Guard:
 * `src/components/ui/typography-tokens.guard.test.ts`.
 */
export const fontWeights = {
  regular: 400,
  medium: 500,
  semibold: 600,
} as const;

export type FontWeights = typeof fontWeights;

/** The hard ceiling. Nothing in the UI may resolve above this. */
export const MAX_FONT_WEIGHT = 600;
