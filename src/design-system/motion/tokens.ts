/** WMS motion physics tokens — the shared spring / fade primitives every `framerTransition` spring and opacity-only flash resolves to. */

import type { Transition } from './framer';

/**
 * Utilitarian spring — high tension, no bounce.
 * Layout shifts, drawer slides, height reveals, list reflow.
 */
export const springSnappy = {
  type: 'spring' as const,
  stiffness: 500,
  damping: 40,
  mass: 0.8,
  /** Stop the animation calculation early to save CPU. */
  restDelta: 0.001,
} as const satisfies Transition;

/**
 * Armed-list track FLIP — snappier mass than {@link springSnappy} so the
 * traveling underline / marker glides row→row without floaty lag. WMS research
 * (stiffness 500 · damping ~38 · mass 0.5). Never inline at call sites.
 */
export const springArmedTrack = {
  type: 'spring' as const,
  stiffness: 500,
  damping: 38,
  mass: 0.5,
  restDelta: 0.001,
} as const satisfies Transition;

/**
 * Instant fade — opacity changes only (tooltips, state icons, save flash).
 * Fast enough that the operator does not wait for it.
 */
export const fadeInstant = {
  type: 'tween' as const,
  ease: 'easeOut' as const,
  duration: 0.15,
} as const satisfies Transition;
