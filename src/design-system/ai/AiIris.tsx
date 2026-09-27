'use client';

/**
 * The iridescent accent — the ONE place the AI's colour appears, and only
 * while it is working (operator interview 2026-09-26). Three shapes:
 *
 * - {@link AiIrisSpinner} — the live step's indicator: a turning iris ring.
 * - {@link AiShimmer} — a light iris sweep across the active step row.
 * - {@link AiIrisRing} — an iris edge around the composer while a turn runs.
 *
 * All three animate `transform` only (rotate / translate on a pre-painted
 * gradient layer), so a working turn costs compositor time, not paint.
 * Reduced motion: the colour stays (it is information — "working"), the
 * movement stops.
 */

import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from '@/design-system/motion';
import { cn } from '@/utils/_cn';
import { aiPresence, aiTransition, useMotionTransition } from './motion';

export function AiIrisSpinner({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  return (
    <span aria-hidden className={cn('relative inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center', className)}>
      <motion.span
        className="absolute inset-0 rounded-full bg-ai-iris-conic"
        animate={reduced ? undefined : { rotate: 360 }}
        transition={aiTransition.irisSpin}
      />
      <span className="absolute inset-[2px] rounded-full bg-ai-surface" />
    </span>
  );
}

/** Place inside a `relative overflow-hidden` row (`AI_STEP_ROW_CLASS`). */
export function AiShimmer() {
  const reduced = useReducedMotion();
  if (reduced) return <span aria-hidden className="pointer-events-none absolute inset-0 bg-ai-iris opacity-[0.07]" />;
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute inset-y-0 left-0 w-2/3 bg-ai-iris-sweep opacity-[0.16]"
      initial={{ x: '-100%' }}
      animate={{ x: '160%' }}
      transition={aiTransition.shimmer}
    />
  );
}

/**
 * An iris edge around `children` while `active`. The child must paint its own
 * opaque surface (the composer shell does); the ring shows as the 1.5px of
 * gradient around it. `className` carries the child's corner (`rounded-ai-*`).
 */
export function AiIrisRing({ active, className, children }: { active: boolean; className?: string; children: ReactNode }) {
  const reduced = useReducedMotion();
  const fade = useMotionTransition(aiTransition.fade);
  return (
    <div className={cn('relative', className)} data-ai-working={active || undefined}>
      <AnimatePresence initial={false}>
        {active ? (
          <motion.div
            key="iris-ring"
            {...aiPresence.fade}
            transition={fade}
            aria-hidden
            className={cn('pointer-events-none absolute -inset-[1.5px] overflow-hidden', className)}
          >
            <motion.div
              className="absolute left-1/2 top-1/2 aspect-square w-[150%] bg-ai-iris-conic"
              style={{ x: '-50%', y: '-50%' }}
              animate={reduced ? undefined : { rotate: 360 }}
              transition={aiTransition.irisSpin}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
      <div className="relative">{children}</div>
    </div>
  );
}
