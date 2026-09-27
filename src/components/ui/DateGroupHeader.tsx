'use client';

import type { ReactNode } from 'react';
import { AnimatePresence, motion } from '@/design-system/motion';
import { formatDateWithOrdinal } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { QUEUE_ROW } from '@/components/ui/queue-row-chrome';
import { motionPresence, motionTransition } from '@/design-system/foundations/motion-presets';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';

/** Day-group header shown between each day's rows in station / receiving / repair lists that still band by civil day. */

/** Sticky row wrapper — left-aligned micro date+qty. */
const dayGroupChipRowClass = cn(
  'flex items-center bg-surface-card/90 py-0.5 backdrop-blur-[2px]',
  QUEUE_ROW.px,
);

/**
 * {@link dayGroupChipRowClass} with an opaque fill — see the note above.
 * Module-local: the `surface` prop is the door, so exporting this would be a
 * second way to reach the same fill (and an unused export besides).
 */
const dayGroupChipRowSolidClass = cn(
  'flex items-center bg-surface-card py-0.5',
  QUEUE_ROW.px,
);

/** Quiet micro date + qty — no border/shadow pill; sticky row is enough chrome.
 *  `whitespace-nowrap` keeps WED/JUN intact (no mid-weekday clip under tight parents). */
const dayGroupChipClass =
  'inline-flex items-center gap-1.5 whitespace-nowrap text-role-micro font-semibold uppercase tracking-wide text-text-muted';

interface DateGroupHeaderProps {
  date: string;
  total: number;
  /**
   * Fill under the sticky band — `translucent` (default) over text rows,
   * `solid` over a media stream. See {@link dayGroupChipRowClass}.
   */
  surface?: 'translucent' | 'solid';
  /** Optional controls rendered right of the count (e.g. a print button). */
  actions?: ReactNode;
  /**
   * Stick to the top of the scroll container as the day's rows scroll past.
   * Default true. Set false for non-scrolling contexts (print, static lists).
   */
  sticky?: boolean;
  /**
   * Absolute `aria-rowindex` when this band sits inside a `role="table"` grid.
   * Supplied by `VirtualGroupedSections`; omitted elsewhere (a bare band outside
   * a table must NOT claim `role="row"` — that is an orphaned role).
   */
  rowIndex?: number;
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
  surface = 'translucent',
  actions,
  sticky = true,
  rowIndex,
  stickyTopClass = 'top-0',
  className,
  animate = false,
}: DateGroupHeaderProps) {
  const rowClass = surface === 'solid' ? dayGroupChipRowSolidClass : dayGroupChipRowClass;
  const layoutTransition = useMotionTransition(motionTransition.chipColumnLayout);
  const mountTransition = useMotionTransition(motionTransition.tableRowMount);
  const countPresence = useMotionPresence(motionPresence.tableRow);

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
        role={rowIndex == null ? undefined : 'row'}
        aria-rowindex={rowIndex}
        data-date={date}
        className={cn(sticky && ['sticky z-raised', stickyTopClass], rowClass, className)}
      >
        <span className={dayGroupChipClass}>{labelEl}</span>
      </div>
    );
  }

  return (
    <motion.div
      role={rowIndex == null ? undefined : 'row'}
      aria-rowindex={rowIndex}
      data-date={date}
      layout
      layoutScroll
      transition={{ layout: layoutTransition }}
      className={cn(sticky && ['sticky z-raised', stickyTopClass], rowClass, className)}
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
