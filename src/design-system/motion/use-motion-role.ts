'use client';

import {
  useMotionPresence,
  useMotionTransition,
} from '../foundations/motion-framer-hooks';
import { useReducedMotion } from './framer';
import type { PresenceRole, motionRole } from './roles';

/**
 * Resolve a presence role to render-ready `{ presence, transition }`, already
 * routed through the reduced-motion bridge.
 *
 * This is the runtime home of "role → reduced form". It replaces the two-call
 * shape every animated surface repeats today:
 *
 *   const presence   = useMotionPresence(framerPresence.stationCartonSwap);
 *   const transition = useMotionTransition(framerTransition.stationCartonSwapMount);
 *
 * with one call that cannot mismatch the pair:
 *
 *   const { presence, transition } = useMotionRole(motionRole.swap.scan);
 *
 * The mismatch is a real defect class, not a hypothetical — presence and
 * transition are separate exports in the catalog, so nothing stopped a surface
 * from pairing the workbench pane's shape with the station's 0.12s duration and
 * getting a swap that is neither job's timing.
 *
 * REDUCTION IS NOT PERFORMED HERE. The app-wide `<MotionConfig reducedMotion="user">`
 * floor (`ReducedMotionProvider`) is what makes reduced motion the default for
 * every framer component; the bridge hooks this composes exist for surfaces
 * needing STRONGER-than-default reduction, and they are what the house has
 * already verified frame-by-frame. This hook adds no third mechanism — it just
 * makes a role carry its pair.
 *
 * Law: Pick a ROLE, not a literal.
 */
export function useMotionRole<T extends PresenceRole>(
  role: T,
): { presence: T['presence']; transition: T['transition'] } {
  const presence = useMotionPresence(role.presence);
  const transition = useMotionTransition(role.transition as Parameters<typeof useMotionTransition>[0]);
  return { presence, transition: transition as T['transition'] };
}

/**
 * Resolve the press role to a `whileTap` target, or `undefined` under reduced
 * motion.
 *
 * Press is the one role suppressed rather than crossfaded: the floor would make
 * a `scale: 0.9` SNAP (transforms are positional keys and get `{ type: false }`),
 * and an instantaneous squash reads as a glitch rather than feedback. Returning
 * `undefined` is what `CardShell` already does by
 * hand — this names it once.
 */
export function useMotionPressRole(
  role: typeof motionRole.gesture.press,
): typeof motionRole.gesture.press.whileTap | undefined {
  const shouldReduce = useReducedMotion();
  return shouldReduce ? undefined : role.whileTap;
}
