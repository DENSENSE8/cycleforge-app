/**
 * WMS motion physics tokens — the shared spring / fade primitives every
 * `framerTransition` spring and opacity-only flash resolves to.
 *
 * Utilitarian fluidity: springs feel organic, but high stiffness + heavy
 * damping (critically damped at stiffness 500 / mass 0.8 / damping 40) snaps
 * into place with no bounce — operator throughput stays high.
 *
 * Feature code never invents stiffness/damping/duration inline. Name a
 * `framerTransition.*` / `motionRole.*` that points here, or compose a
 * dense primitive (`DenseRowReveal` / `DenseList` / `ActionFlashRow`).
 *
 * Law: Spring vs cubic-bezier.
 */

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
 * The CONCIERGE spring — chat-surface entrance physics. Softer than
 * {@link springSnappy}: a little overshoot (stiffness 170 · damping 22) so a
 * chat turn lands like it was placed, not snapped. Scoped to the session
 * surface (design-system-ideas-LOOP #8: springs ~stiffness 120–200, damping
 * 18–25) — station throughput surfaces keep `springSnappy`.
 */
export const springConcierge = {
  type: 'spring' as const,
  stiffness: 170,
  damping: 22,
  mass: 1,
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

/**
 * Pointer FOLLOW — duration 0. A spring on cursor x/y is lag; the hand
 * has already moved. Morph size still uses {@link springArmedTrack}.
 */
export const cursorFollowSnap = {
  type: 'tween' as const,
  duration: 0,
  ease: 'linear' as const,
} as const satisfies Transition;
