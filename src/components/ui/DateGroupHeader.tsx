'use client';

import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { formatDateWithOrdinal } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { QUEUE_ROW } from '@/components/ui/queue-row-chrome';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';

/**
 * Day-group header shown between each day's rows in every list/board table.
 *
 * Micro sticky label (date + qty) — quiet chrome so lane headers and rows stay
 * primary. Sticky so as a day's rows scroll past, the label docks to the top of
 * the scroll container and *is* the live date header.
 *
 * When `animate` is on (dense queue / swimlane Show more), the sticky row + label
 * use the same layout spring as chip columns / order rows so the top-left date
 * reflows with the list; the qty count crossfades when the day total changes.
 *
 * One component for every table (packer / tech / shipped / orders / receiving /
 * repair / sales, desktop + mobile) and the swim-lane board lanes.
 */

/** Sticky row wrapper — left-aligned micro date+qty; soft fill so rows don't bleed under.
 *  Horizontal pad matches QUEUE_ROW.px so the day label shares the row title edge. */
export const dayGroupChipRowClass = cn(
  'flex items-center bg-surface-card/90 py-0.5 backdrop-blur-[2px]',
  QUEUE_ROW.px,
);

/** Quiet micro date + qty — no border/shadow pill; sticky row is enough chrome.
 *  `whitespace-nowrap` keeps WED/JUN intact (no mid-weekday clip under tight parents). */
export const dayGroupChipClass =
  'inline-flex items-center gap-1.5 whitespace-nowrap text-role-micro font-semibold uppercase tracking-wide text-text-muted';

interface DateGroupHeaderProps {
  date: string;
  total: number;
  /** Optional controls rendered right of the count (e.g. a print button). */
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
   * Layout + count crossfade so the date label moves/updates with row expand
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
          className="font-mono tabular-nums text-text-soft"
        >
          {total}
        </motion.span>
      </AnimatePresence>
    </span>
  ) : (
    <span className="font-mono tabular-nums text-text-soft">{total}</span>
  );

  const labelEl = (
    <>
      <span className="text-text-muted">{formatDateWithOrdinal(date)}</span>
      <span aria-hidden className="text-text-soft">
        ·
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
