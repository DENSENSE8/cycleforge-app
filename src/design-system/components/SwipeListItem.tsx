'use client';

/**
 * SwipeListItem — the ONE motion for a list row that arrives or leaves for
 * good (owner 2026-09-27: Apple Reminders / notification swipe):
 *
 * - **arrive** (`enter="swipe"`): the list opens a gap (rows below move down),
 *   then the row slides in from the left edge to its place;
 * - **leave** (`exit="swipe"`): the row slides left off the list while the gap
 *   closes (rows below move up).
 *
 * Both directions use the same ease-in-out curve and duration; `stagger` is the
 * row's position among the rows moving together. Height rides {@link CollapseItem}
 * (the one height animation), so the layout around the row never snaps. The
 * tree is the same for every row (frame → slide box → content): `enter` is
 * read once, at mount, and `exit` may flip to `swipe` later (Delete marks a
 * row just before it leaves) without remounting the content. Reduced motion is
 * honoured by the app's `MotionConfig reducedMotion="user"`.
 */

import type { ReactNode } from 'react';
import { motion } from '@/design-system/motion';
import { CollapseItem } from './Collapse';

/** Ease-in-out, one duration both ways, one step between rows moving together. */
export const LIST_SWIPE = {
  duration: 0.34,
  ease: [0.65, 0, 0.35, 1] as const,
  /** Seconds between consecutive rows. */
  stagger: 0.06,
  /** The row slides in once its gap has mostly opened. */
  enterAfterGap: 0.2,
  /** The gap starts closing half-way through the slide out. */
  exitGapLead: 0.5,
} as const;

const OFF_LEFT = { x: '-105%', opacity: 0 } as const;
const IN_PLACE = { x: 0, opacity: 1 } as const;

export function SwipeListItem({
  children,
  enter = 'none',
  exit = 'collapse',
  stagger = 0,
  as = 'li',
  rowRule = false,
}: {
  children: ReactNode;
  /** `swipe`: open the gap, then slide in from the left. `none`: paint in place. */
  enter?: 'swipe' | 'none';
  /** `swipe`: slide off to the left while the gap closes. `collapse`: close the gap only. */
  exit?: 'swipe' | 'collapse';
  /** Index among the rows arriving / leaving together. */
  stagger?: number;
  as?: 'li' | 'div';
  rowRule?: boolean;
}) {
  const offset = LIST_SWIPE.stagger * stagger;
  const swipeIn = enter === 'swipe';
  const swipeOut = exit === 'swipe';
  return (
    <CollapseItem
      as={as}
      enter={swipeIn}
      delay={swipeIn ? offset : undefined}
      exitDelay={swipeOut ? offset + LIST_SWIPE.duration * LIST_SWIPE.exitGapLead : undefined}
      rowRule={rowRule}
    >
      <motion.div
        initial={swipeIn ? OFF_LEFT : false}
        animate={{
          ...IN_PLACE,
          transition: { duration: LIST_SWIPE.duration, ease: LIST_SWIPE.ease, delay: offset + LIST_SWIPE.enterAfterGap },
        }}
        exit={
          swipeOut
            ? { ...OFF_LEFT, transition: { duration: LIST_SWIPE.duration, ease: LIST_SWIPE.ease, delay: offset } }
            : undefined
        }
      >
        {children}
      </motion.div>
    </CollapseItem>
  );
}
