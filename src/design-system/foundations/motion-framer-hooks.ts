'use client';

import { useReducedMotion, type Transition } from '../motion/framer';

/**
 * Pair a motion transition with `prefers-reduced-motion`.
 *
 * Returns the given transition unchanged when the user has not opted into
 * reduced motion, and a near-zero-duration transition otherwise. Use this in
 * place of inline `useReducedMotion()` + ternary boilerplate.
 *
 *   const transition = useMotionTransition(framerTransition.cardExpansion);
 *   <motion.div transition={transition} ... />
 */
export function useMotionTransition(transition: Transition): Transition {
  const shouldReduce = useReducedMotion();
  return shouldReduce ? { duration: 0 } : transition;
}

/**
 * Motion keys that carry *vestibular* movement — the ones reduced motion is
 * meant to remove. Everything else (opacity, height, …) is preserved.
 */
const REDUCED_MOTION_STRIPPED_KEYS = new Set([
  'x', 'y', 'z',
  'translateX', 'translateY', 'translateZ',
  'scale', 'scaleX', 'scaleY',
  'rotate', 'rotateX', 'rotateY', 'rotateZ',
  'skew', 'skewX', 'skewY',
  'transformPerspective',
  'filter',
]);

function stripMotionKeys<S extends object>(shape: S): S {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(shape)) {
    if (!REDUCED_MOTION_STRIPPED_KEYS.has(k)) out[k] = v;
  }
  return out as S;
}

/**
 * The reduced form of a presence shape — the pure core of
 * {@link useMotionPresence}, split out so it is directly testable.
 *
 * A hook cannot be called without a React renderer, and this repo's unit tests
 * are plain `node:test` + `tsx` with no DOM. Keeping the decision here means
 * the behaviour that actually regressed (which keys survive) is pinned by
 * `motion-framer-hooks.test.ts` instead of resting on review.
 */
export function reducePresenceShape<T extends { initial: object; animate: object; exit?: object }>(
  presence: T,
): T {
  return {
    ...presence,
    initial: stripMotionKeys(presence.initial),
    animate: stripMotionKeys(presence.animate),
    ...(presence.exit ? { exit: stripMotionKeys(presence.exit) } : {}),
  };
}

/**
 * Pair a presence shape (initial/animate/exit) with `prefers-reduced-motion`.
 *
 * Returns the full shape when the user has not opted into reduced motion;
 * otherwise strips only the translation / scale / rotation / blur keys and
 * keeps the rest, so an element still appears and disappears without moving.
 *
 * IMPORTANT — why this is not "opacity only". It used to return a flat
 * `{ initial:{opacity}, animate:{opacity}, exit:{opacity} }`, which DISCARDED
 * the `height` keys of `framerPresence.collapseHeight` / `sidebarSection`
 * (both `{height:0} → {height:'auto'}`). The element then faded while holding
 * its full box and never collapsed at all — over-reduction, not reduction.
 * `collapseHeight` is the one sanctioned height animation in
 * `.claude/rules/display/motion-crossfade.md`, so it must survive.
 *
 * Paired with `useMotionTransition`'s `{ duration: 0 }`, a preserved height
 * key snaps instantly — which is exactly what the app-wide
 * `<MotionConfig reducedMotion="user">` floor does to `height` on its own
 * (verified: framer treats `height` as a positional key and gives it
 * `{ type: false }`). Bridge and floor therefore agree.
 */
export function useMotionPresence<T extends { initial: object; animate: object; exit?: object }>(
  presence: T,
): T {
  const shouldReduce = useReducedMotion();
  return shouldReduce ? reducePresenceShape(presence) : presence;
}
