'use client';

import { motion, type HTMLMotionProps } from '@/design-system/motion';
import { aiPresence, aiTransition, useMotionPresence, useMotionTransition } from './motion';

/**
 * AiTurn — the entrance wrapper for one transcript row (user bubble, answer,
 * notice, connect prompt). A short settle-rise, no bounce; reduced motion
 * keeps the fade only. Turns never animate out — the transcript is an
 * append-only log.
 */
export function AiTurn({ children, ...rest }: HTMLMotionProps<'div'>) {
  const presence = useMotionPresence(aiPresence.turn);
  const transition = useMotionTransition(aiTransition.turn);
  return (
    <motion.div initial={presence.initial} animate={presence.animate} transition={transition} {...rest}>
      {children}
    </motion.div>
  );
}
