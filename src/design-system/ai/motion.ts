'use client';

/**
 * AI design system — motion (Motion `motion/react` + Motion+, through the
 * house import sites `@/design-system/motion` and `@/design-system/motion/plus`).
 *
 * Expressive but quick (operator interview 2026-09-26): every state change
 * moves, on springs with a SLIGHT bounce (0.15–0.25) over 200–400ms.
 *
 * - TRANSFORM + OPACITY only. Layout moves (the composer gliding from the
 *   middle of the column to its bottom, the column re-centring beside the panel)
 *   are Motion `layout` animations — measured once and played as transforms —
 *   gated by `layoutDependency` so a streaming transcript never re-measures.
 *   The activity loops (iris spin, shimmer sweep) are transform loops too.
 * - REDUCED MOTION → fades only: pair presets with `useMotionPresence` /
 *   `useMotionTransition` (re-exported below; travel stripped, fade kept) and
 *   pass `layout={reduced ? false : …}`; activity loops stop.
 */

import type { Transition } from '@/design-system/motion';

/** Shared-layout id of THE composer — the one node that moves from centre to bottom. */
export const AI_COMPOSER_LAYOUT_ID = 'ai-composer';

export const aiTransition = {
  /** The composer's centre → bottom glide (and back on a new conversation). */
  composerGlide: { type: 'spring', visualDuration: 0.4, bounce: 0.18 },
  /** The column re-centring when the side panel docks / undocks. */
  columnShift: { type: 'spring', visualDuration: 0.36, bounce: 0.15 },
  /** Side panel slide + fade. */
  panel: { type: 'spring', visualDuration: 0.34, bounce: 0.16 },
  /** A transcript turn, card or step row arriving. */
  turn: { type: 'spring', visualDuration: 0.3, bounce: 0.18 },
  /** Greeting / chips leaving when the first message is sent. */
  leave: { type: 'tween', duration: 0.16, ease: [0.4, 0, 1, 1] },
  /** Spinner → ✓ / ✕ morph. */
  morph: { type: 'spring', visualDuration: 0.24, bounce: 0.25 },
  /** Card press / hover lift. */
  press: { type: 'spring', visualDuration: 0.2, bounce: 0.25 },
  /** Opacity-only swaps. */
  fade: { type: 'tween', duration: 0.2, ease: [0.2, 0, 0, 1] },
  /** A new thinking-line phrase wiping in, left to right. */
  wipe: { type: 'tween', duration: 0.38, ease: [0.2, 0, 0, 1] },
  /** The thinking line's left-to-right sweep (`AiTextShimmer`), looped. */
  shimmer: { duration: 1.6, ease: 'easeInOut', repeat: Infinity, repeatDelay: 0.2 },
} as const satisfies Record<string, Transition>;

/** Stagger between thinking-step rows entering together (seconds). */
export const AI_STEP_STAGGER = 0.05;

export const aiPresence = {
  /** Transcript turn / artifact card mount. */
  turn: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -4 },
  },
  /** A thinking-step row building into the live timeline. */
  step: {
    initial: { opacity: 0, x: -6 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0 },
  },
  /** Spinner ↔ ✓ / ✕ — the status glyph swap. */
  glyph: {
    initial: { opacity: 0, scale: 0.4, rotate: -45 },
    animate: { opacity: 1, scale: 1, rotate: 0 },
    exit: { opacity: 0, scale: 0.4 },
  },
  /** Empty-state greeting — a short deblur rise. */
  greeting: {
    initial: { opacity: 0, y: 6, filter: 'blur(4px)' },
    animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
    exit: { opacity: 0, y: -6, filter: 'blur(2px)' },
  },
  /** Suggestion chips under the empty composer. */
  chips: {
    initial: { opacity: 0, y: 4 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 4 },
  },
  /** Docked side panel — slides in from the right edge. */
  panel: {
    initial: { opacity: 0, x: 28 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 28 },
  },
  /** Opacity-only layers: the overlay scrim, the iris edge. */
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  /** Panel body swapping to another artifact. */
  swap: {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0 },
  },
} as const;

export const aiGesture = {
  /** Artifact card: a 1px lift on hover, a press on tap. */
  card: { whileHover: { y: -1 }, whileTap: { scale: 0.985 } },
} as const;

/**
 * The reduced-motion bridge AI surfaces pair every preset with (travel stripped,
 * fade kept; transitions collapse to instant) — the house hooks, re-exported so
 * an AI component imports its whole motion vocabulary from one place.
 */
export { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
