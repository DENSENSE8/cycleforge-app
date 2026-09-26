'use client';

import { useReducedMotion, type Transition } from '../motion/framer';

/** Pair a motion transition with `prefers-reduced-motion`. */
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

/** The reduced form of a presence shape — the pure core of {@link useMotionPresence}, split out so it is directly testable. */
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

/** Pair a presence shape (initial/animate/exit) with `prefers-reduced-motion`. */
export function useMotionPresence<T extends { initial: object; animate: object; exit?: object }>(
  presence: T,
): T {
  const shouldReduce = useReducedMotion();
  return shouldReduce ? reducePresenceShape(presence) : presence;
}
