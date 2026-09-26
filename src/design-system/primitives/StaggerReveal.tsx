'use client';

import type { ReactNode } from 'react';
import { motion, type Variants } from '@/design-system/motion';
import { motionBezier } from '../foundations/motion-framer';

/** Stagger reveal — list items cascade in for freshly-loaded queues. */

/** Default cascade step (seconds) between consecutive children. */
export const STAGGER_REVEAL_STEP = 0.05;

/** Container variants — drive `initial="hidden" animate="show"` on the list. */
export const staggerRevealContainer = (step: number = STAGGER_REVEAL_STEP): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: step, delayChildren: 0.02 } },
});

/**
 * Prefer {@link staggerRevealRiseItem} for desk tables / full-bleed queues.
 * Prefer {@link staggerRevealSidebarItem} inside a vertically scrolling sidebar
 * rail — `overflow-y: auto` clips horizontal overflow.
 */

/** Sidebar-rail stagger — rows are legible from first paint while a short upward settle preserves the cascade. */
export const staggerRevealSidebarItem: Variants = {
  hidden: { opacity: 1, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: motionBezier.easeOut } },
  // Left-edge exit matches scan/dismiss CRUD presence (`framerPresence.sidebarRailRow`).
  exit: {
    opacity: 0,
    x: -12,
    pointerEvents: 'none' as const,
    transition: { duration: 0.2, ease: motionBezier.easeOut },
  },
};

/** Horizontal sidebar-rail stagger — the scan-in language for Unboxed / scan-dock rails. */
export const staggerRevealSidebarSlideItem: Variants = {
  hidden: { opacity: 0, x: -12 },
  show: {
    opacity: 1,
    x: 0,
    transition: {
      opacity: { duration: 0.32, ease: motionBezier.easeOut },
      x: { type: 'spring', damping: 24, stiffness: 140 },
    },
  },
  exit: {
    opacity: 0,
    x: -12,
    pointerEvents: 'none' as const,
    transition: { duration: 0.2, ease: motionBezier.easeOut },
  },
};

/** Vertical "settle" reveal item — full-width stacked cards / desk TABLE rows rise + fade in sequence. */
export const staggerRevealRiseItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: motionBezier.easeOut } },
  exit: { opacity: 0, transition: { duration: 0.12, ease: motionBezier.easeOut } },
};

const CONTAINER_TAGS = { ul: motion.ul, ol: motion.ol, div: motion.div } as const;
const ITEM_TAGS = { li: motion.li, div: motion.div } as const;

export interface StaggerRevealProps {
  children: ReactNode;
  /** Seconds between each child. */
  step?: number;
  className?: string;
  /** Container element — defaults to `ul`. */
  as?: keyof typeof CONTAINER_TAGS;
  /** Change this value to replay the cascade (remounts the container). */
  replayKey?: string | number;
}

/** Cascade container. Pair its children with {@link StaggerRevealItem}. */
export function StaggerReveal({ children, step, className, as = 'ul', replayKey }: StaggerRevealProps) {
  const Tag = CONTAINER_TAGS[as];
  return (
    <Tag
      key={replayKey}
      initial="hidden"
      animate="show"
      variants={staggerRevealContainer(step)}
      className={className}
    >
      {children}
    </Tag>
  );
}

export interface StaggerRevealItemProps {
  children: ReactNode;
  className?: string;
  /** Item element — defaults to `li`. */
  as?: keyof typeof ITEM_TAGS;
}

/** A single cascading row — inherits the parent {@link StaggerReveal}'s timeline. */
export function StaggerRevealItem({ children, className, as = 'li' }: StaggerRevealItemProps) {
  const Tag = ITEM_TAGS[as];
  return (
    <Tag variants={staggerRevealRiseItem} className={className}>
      {children}
    </Tag>
  );
}
