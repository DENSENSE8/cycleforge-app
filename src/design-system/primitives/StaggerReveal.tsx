'use client';

import type { ReactNode } from 'react';
import { motion, useReducedMotion, type Variants } from '@/design-system/motion';
import { motionBezier } from '../foundations/motion-framer';
import { springSnappy } from '../motion/tokens';

/**
 * Stagger reveal — list items cascade in for freshly-loaded queues.
 *
 * Two layers:
 *   • {@link staggerRevealContainer} / item variants — the raw variants, for
 *     wiring straight onto an existing `motion.ul` + `motion.li` pair (used by
 *     SidebarRailShell, which owns its own list/row markup and AnimatePresence).
 *     The container orchestrates the cascade; each item inherits `hidden → show`.
 *   • {@link StaggerReveal} / {@link StaggerRevealItem} — turnkey wrappers for
 *     the common case (showroom, desk tables, simple lists). Default item motion
 *     is the vertical RISE ({@link staggerRevealRiseItem}) — full-bleed queues
 *     must not wipe left→right. Set `replayKey` to re-run.
 *
 * The cascade fires once on mount (when the parent transitions hidden → show).
 * Children mounted later — e.g. a freshly-scanned row arriving via
 * AnimatePresence — slide in individually rather than re-orchestrating the
 * whole list, so steady-state updates stay calm.
 */

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

/**
 * Sidebar-rail stagger — rows are legible from first paint while a short upward
 * settle preserves the cascade. Safe inside `overflow-y-auto` scroll bodies:
 * nothing translates past the left edge. Pair with
 * {@link staggerRevealContainer} on the list parent.
 */
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

/**
 * Horizontal sidebar-rail stagger — the scan-in language for Unboxed / scan-dock
 * rails. Rows genuinely APPEAR from nothing: opacity fades 0 → 1 while the row
 * slides in left→right (x:-12 → 0). The two axes run on DIFFERENT transitions on
 * purpose — opacity is a short ease-out TWEEN, x is the spring. Opacity must not
 * ride the spring: framer approximates a spring as a long WAAPI keyframe array,
 * and on completion it briefly drops the composited animation before committing
 * the final style, flashing the `hidden` opacity:0 through for a frame (a blink
 * as the row lands). A plain-duration tween commits cleanly, so the fade-in has
 * no end-of-reveal flicker. Stays inside `overflow-x-clip` without clipping
 * status dots (under a leftward x:-20 wipe). Exit fades out on
 * dismiss; steady-state add/delete presence is owned by `sidebarRailRow`.
 */
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

/**
 * Vertical "settle" reveal item — full-width stacked cards / desk TABLE rows
 * rise + fade in sequence. Default for {@link StaggerRevealItem} and
 * `CardShell` `entrance="stagger"`. Use wherever a horizontal left wipe
 * would read wrong on full-bleed work surfaces. Opacity + y only
 * (GPU-composited; never animates layout). Pair with
 * {@link staggerRevealContainer} on the parent, and collapse to opacity-only at
 * the call site under `prefers-reduced-motion`.
 */
export const staggerRevealRiseItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: motionBezier.easeOut } },
  exit: { opacity: 0, transition: { duration: 0.12, ease: motionBezier.easeOut } },
};

/**
 * Elevated drop-in — rows arrive slightly above + scaled, then settle into
 * place (desk intake fact cards, staging inserts). Opacity is a short tween so
 * spring completion cannot flash `hidden`; y/scale ride {@link springSnappy}.
 * Pair with {@link staggerRevealContainer}.
 */
export const staggerRevealDropItem: Variants = {
  hidden: { opacity: 0, y: -12, scale: 0.97 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      opacity: { duration: 0.2, ease: motionBezier.easeOut },
      y: springSnappy,
      scale: springSnappy,
    },
  },
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
  'data-testid'?: string;
}

/** Cascade container. Pair its children with {@link StaggerRevealItem}. */
export function StaggerReveal({
  children,
  step,
  className,
  as = 'ul',
  replayKey,
  'data-testid': testId,
}: StaggerRevealProps) {
  const Tag = CONTAINER_TAGS[as];
  return (
    <Tag
      key={replayKey}
      initial="hidden"
      animate="show"
      variants={staggerRevealContainer(step)}
      className={className}
      data-testid={testId}
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
  /** Defaults to vertical rise. Pass {@link staggerRevealDropItem} for top-down settle. */
  variants?: Variants;
  'data-testid'?: string;
}

/** A single cascading row — inherits the parent {@link StaggerReveal}'s timeline. */
export function StaggerRevealItem({
  children,
  className,
  as = 'li',
  variants = staggerRevealRiseItem,
  'data-testid': testId,
}: StaggerRevealItemProps) {
  const Tag = ITEM_TAGS[as];
  return (
    <Tag variants={variants} className={className} data-testid={testId}>
      {children}
    </Tag>
  );
}

export interface StaggerRevealRowProps {
  children: ReactNode;
  className?: string;
  /**
   * False on rows that were already on screen — they must not re-rise every
   * time the list re-renders. They still carry `layout`, which is what makes
   * them SPRING APART when a batch lands between them.
   */
  entering?: boolean;
  /** Defaults to the vertical rise — the desk-table language. */
  variants?: Variants;
  'data-testid'?: string;
}

/**
 * One reveal row with **no cascade container** — the VIRTUALIZED twin of
 * {@link StaggerRevealItem}.
 *
 * A windowed grid (`VirtualGroupedSections`) absolutely positions every row
 * from its own measured `top`, so there is no shared parent element that could
 * own a `staggerChildren` timeline or a `<ul>` the rows are `<li>`s of. This
 * row therefore drives `hidden → show` itself, and carries `layout` so that
 * when the window's math moves it — a batch splicing in above it — the
 * displacement is a spring instead of a jump. Wrap the list in `LayoutGroup`
 * so every row's layout animation resolves in one batch.
 *
 * Reduced motion: final position and full opacity on the first frame, with the
 * layout channel off. No travel, no fade.
 */
export function StaggerRevealRow({
  children,
  className,
  entering = true,
  variants = staggerRevealRiseItem,
  'data-testid': testId,
}: StaggerRevealRowProps) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      layout={reduce ? false : 'position'}
      layoutDependency={entering}
      transition={springSnappy}
      variants={variants}
      initial={reduce || !entering ? false : 'hidden'}
      animate="show"
      className={className}
      data-testid={testId}
    >
      {children}
    </motion.div>
  );
}
