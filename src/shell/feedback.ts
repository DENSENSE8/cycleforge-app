'use client';

/**
 * FEEDBACK MOTION — the only animation runtime in the shell.
 *
 * The ruling (2026-08-24): "motion.dev must be used for user feedback
 * animation, not layout animations." That line is sharper than M1 as it
 * was written, and M1 was amended to match — see the LAW note below.
 *
 * ## What this is for
 *
 * DISCRETE EVENTS ONLY. A scan landed. A commit was rejected. A work order
 * arrived in the queue. Things that HAPPEN, once, and that the operator
 * must notice without looking directly at them.
 *
 * ## What this is NOT for
 *
 * CONTINUOUS STATE — hover, focus, press, open/closed. Those stay in CSS
 * (`transition: background-color var(--t-tint)`). The compositor does them
 * for free; routing them through a JS runtime is a strict downgrade in
 * both latency and bundle. If Motion ever starts owning a hover state,
 * this module has failed and should be reverted.
 *
 * ## The four guardrails, enforced here rather than hoped for
 *
 * 1. COMPOSITED PROPERTIES ONLY. `transform` and `opacity`, plus colour.
 *    Never width/height/top/left/margin/padding/inset — those reflow and
 *    displace a neighbour, which is the thing M1 actually exists to stop.
 *    `KEYFRAMES` below is the entire vocabulary; there is no escape hatch
 *    that takes an arbitrary property.
 *
 * 2. NEVER ON THE SCAN PATH. `play()` returns void, not a promise, and
 *    nothing may await it. The wedge must never wait on a paint (I2/I3,
 *    T20/T21).
 *
 * 3. INTERRUPTIBLE, NEVER QUEUED. A second event on the same element
 *    cancels the first and restarts. An operator scanning at speed
 *    generates events faster than any animation can finish; a queue would
 *    turn feedback into a lagging indicator, which is worse than none.
 *
 * 4. REINFORCEMENT, NEVER THE SOLE CARRIER. Every call site must ALSO
 *    change a colour or a value. Under `prefers-reduced-motion` — which
 *    `MotionConfig` honours shell-wide, and which is a reasonable default
 *    for an operator who sees this 300 times a shift — `play()` no-ops
 *    entirely, and the surface must still read correctly.
 */

import { animate } from 'motion/react';

/**
 * LAW NOTE (M1, amended 2026-08-24). M1 banned "width, height, top/left/
 * right/bottom, margin, padding, TRANSFORM or flex". Lumping `transform`
 * in with `height` was a category error: transform is composited on the
 * GPU and displaces nothing, while height reflows and pushes every
 * neighbour for the length of the tween. M1's own stated reasoning is
 * entirely about the second thing —
 *
 *   "a collapse that animates its height still occupies the space for
 *    the length of the tween"
 *   "a row that springs into its new position delays the paint that
 *    tells a scanning operator the scan landed"
 *
 * — so the real invariant is NOTHING MAY ANIMATE A PROPERTY THAT MOVES A
 * NEIGHBOUR. That bans exactly what M1 meant to ban and permits exactly
 * what feedback needs. Motion's `layout`, `layoutScroll`, `LayoutGroup`
 * and `<Reorder>` remain banned outright: they work by measuring and
 * tweening position, which is the banned thing wearing a nicer API.
 */
export type FeedbackKind = 'commit' | 'reject' | 'arrive';

/**
 * The whole vocabulary. Durations sit above `--t-tint` (80ms) on purpose:
 * 80ms is right for a tint that follows the pointer, and near-subliminal
 * for a discrete confirm the operator is meant to catch peripherally.
 * They stay under ~200ms because this fires hundreds of times a shift.
 */
const KEYFRAMES: Record<
  FeedbackKind,
  { readonly transform?: string[]; readonly opacity?: number[]; readonly duration: number }
> = {
  /** Scan landed / write committed — a single confident swell. */
  commit: { transform: ['scale(1)', 'scale(1.015)', 'scale(1)'], duration: 0.14 },
  /** Rejected — a lateral shake, the one gesture nobody reads as success. */
  reject: {
    transform: ['translateX(0px)', 'translateX(-3px)', 'translateX(3px)', 'translateX(0px)'],
    duration: 0.16,
  },
  /** Arrived in a queue the operator is not looking at — fade, no motion. */
  arrive: { opacity: [0, 1], duration: 0.12 },
};

/** Live animations per element, so a repeat cancels rather than stacks. */
const running = new WeakMap<Element, { stop: () => void }>();

/**
 * Fire a feedback animation. Returns void — see guardrail 2. Safe to call
 * with `null` so a call site never needs a ref guard.
 */
export function playFeedback(
  el: Element | null | undefined,
  kind: FeedbackKind,
  reducedMotion = false,
): void {
  if (!el) return;

  // Guardrail 3 — cancel first, always, before deciding whether to play.
  running.get(el)?.stop();
  running.delete(el);

  // Guardrail 4 — reduced motion is a full stop, not a shortened tween.
  // The call site's colour/value change is what carries the meaning.
  if (reducedMotion) return;

  const frames = KEYFRAMES[kind];
  const controls = animate(
    el,
    { ...(frames.transform ? { transform: frames.transform } : {}), ...(frames.opacity ? { opacity: frames.opacity } : {}) },
    { duration: frames.duration, ease: 'easeOut' },
  );

  running.set(el, controls);
  void controls.finished.catch(() => {}).then(() => {
    if (running.get(el) === controls) running.delete(el);
  });
}
