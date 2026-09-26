'use client';

import {
  useMotionPresence,
  useMotionTransition,
} from '../foundations/motion-framer-hooks';
import { useReducedMotion } from './framer';
import type { PresenceRole, motionRole } from './roles';

/** Resolve a presence role to render-ready `{ presence, transition }`, already routed through the reduced-motion bridge. */
export function useMotionRole<T extends PresenceRole>(
  role: T,
): { presence: T['presence']; transition: T['transition'] } {
  const presence = useMotionPresence(role.presence);
  const transition = useMotionTransition(role.transition as Parameters<typeof useMotionTransition>[0]);
  return { presence, transition: transition as T['transition'] };
}

/** Resolve the press role to a `whileTap` target, or `undefined` under reduced motion. */
export function useMotionPressRole(
  role: typeof motionRole.gesture.press,
): typeof motionRole.gesture.press.whileTap | undefined {
  const shouldReduce = useReducedMotion();
  return shouldReduce ? undefined : role.whileTap;
}
