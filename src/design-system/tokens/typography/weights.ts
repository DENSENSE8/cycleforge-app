/**
 * Weight ladder — capped at 600 (2026-07-28, contextual-font-system).
 * Plex Mono loads 700 for mono labels and
 */
export const fontWeights = {
  regular: 400,
  medium: 500,
  semibold: 600,
} as const;

type FontWeights = typeof fontWeights;

/** The hard ceiling. Nothing in the UI may resolve above this. */
const MAX_FONT_WEIGHT = 600;
