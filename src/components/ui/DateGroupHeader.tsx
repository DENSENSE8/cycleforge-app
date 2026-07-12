'use client';

import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { formatDateWithOrdinal } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';

/**
 * Day-group header shown between each day's rows in every list/board table.
 *
 * It renders a single left-aligned **date + qty pill** — the same rounded-pill
 * language as the {@link DateRangeHeader} period pill — so the day separator and
 * the table's range header read as one family. The row is `position: sticky`, so
 * as a day's rows scroll past, the pill docks to the top of the scroll container
 * and *is* the live date header.
 *
 * When `animate` is on (dense queue / swimlane Show more), the sticky row + pill
 * use the same layout spring as chip columns / order rows so the top-left date
 * reflows with the list; the qty count crossfades when the day total changes.
 *
 * One component for every table (packer / tech / shipped / orders / receiving /
 * repair / sales, desktop + mobile) and the swim-lane board lanes. There is no
 * longer a full-bleed "band" variant — the pill is the only day header.
 */

/** Sticky row wrapper — left-aligned, holds the floating date+qty pill. */
export const dayGroupChipRowClass = 'flex items-center px-3 py-1.5';

/** The date + qty pill — matches the DateRangeHeader period pill. */
export const dayGroupChipClass =
  'inline-flex items-center gap-2 rounded-full border border-border-soft bg-surface-card px-3 py-1 shadow-sm';

interface DateGroupHeaderProps {
  date: string;
  total: number;
  /** Optional controls rendered inside the pill, right of the count (e.g. a print button). */
  actions?: ReactNode;
  /**
   * Stick to the top of the scroll container as the day's rows scroll past.
   * Default true. Set false for non-scrolling contexts (print, static lists).
   */
  sticky?: boolean;
  /**
   * Sticky offset utility. Default `top-0` — correct when the table header sits
   * *outside* the scroll container (the house pattern). Override only if a
   * header lives inside the same scroll viewport.
   */
  stickyTopClass?: string;
  className?: string;
  /**
   * Layout + count crossfade so the date pill moves/updates with row expand
   * (Show more) and chip-column reflow. Off for virtualized remounts / print.
   */
  animate?: boolean;
}

export function DateGroupHeader({
  date,
  total,
  actions,
  sticky = true,
  stickyTopClass = 'top-0',
  className,
  animate = false,
}: DateGroupHeaderProps) {
  const layoutTransition = useMotionTransition(framerTransition.chipColumnLayout);
  const mountTransition = useMotionTransition(framerTransition.tableRowMount);
  const countPresence = useMotionPresence(framerPresence.tableRow);

  const countEl = animate ? (
    <span className="relative inline-flex min-w-[1ch] items-center justify-center overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={total}
          {...countPresence}
          transition={{ opacity: mountTransition, y: mountTransition }}
          className="text-caption font-bold tabular-nums text-text-soft"
        >
          {total}
        </motion.span>
      </AnimatePresence>
    </span>
  ) : (
    <span className="text-caption font-bold tabular-nums text-text-soft">{total}</span>
  );

  const labelEl = (
    <>
      <span className="text-caption font-black uppercase tracking-widest text-text-default">
        {formatDateWithOrdinal(date)}
      </span>
      <span aria-hidden className="text-text-faint">
        •
      </span>
      {countEl}
      {actions}
    </>
  );

  if (!animate) {
    return (
      <div
        data-date={date}
        className={cn(sticky && ['sticky z-raised', stickyTopClass], dayGroupChipRowClass, className)}
      >
        <span className={dayGroupChipClass}>{labelEl}</span>
      </div>
    );
  }

  return (
    <motion.div
      data-date={date}
      layout
      layoutScroll
      transition={{ layout: layoutTransition }}
      className={cn(sticky && ['sticky z-raised', stickyTopClass], dayGroupChipRowClass, className)}
    >
      <motion.span
        layout
        transition={{ layout: layoutTransition }}
        className={dayGroupChipClass}
      >
        {labelEl}
      </motion.span>
    </motion.div>
  );
}
