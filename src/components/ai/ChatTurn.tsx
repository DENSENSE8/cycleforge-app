'use client';

/**
 * ChatTurn — the entrance wrapper for one transcript row.
 *
 * User bubble, assistant prose block, connect pill, helper band: every line
 * the transcript GROWS mounts through this so the whole column reads as one
 * continuous conversation instead of a series of hard cuts. Physics come from
 * `motionRole.chat.turn` (the concierge spring — placed, not snapped), already
 * routed through the reduced-motion bridge, so a turn crossfades instead of
 * travelling for `prefers-reduced-motion` users.
 *
 * Chat messages never animate OUT (they are an append-only log); the exit
 * shape exists for the Motion Lab's replay and any future transcript reset.
 */

import { motion, motionRole, useMotionRole, type HTMLMotionProps } from '@/design-system/motion';
import { cn } from '@/utils/_cn';
export function ChatTurn({ children, className, ...rest }: HTMLMotionProps<'div'>) {
  const { presence, transition } = useMotionRole(motionRole.chat.turn);
  return (
    <motion.div className={cn(className)} {...presence} transition={transition} {...rest}>
      {children}
    </motion.div>
  );
}
