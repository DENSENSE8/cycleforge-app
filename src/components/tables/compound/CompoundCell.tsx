'use client';

/**
 * The two-row compound cell — one stacked body shared by every compound column
 * on every table.
 *
 * **Alignment is the whole job.** A compound row only reads as a table if the
 * top line of column 2 sits on the same baseline as columns 3 and 4, and
 * likewise for the bottom line. If each cell stacked its own two children with
 * its own gap, the columns would drift the moment one cell's primary wrapped or
 * its secondary went empty — the failure mode that makes a two-row grid look
 * like a list of cards.
 *
 * So the two lines are FIXED TRACKS, not content-sized:
 *
 * - the cell is a 2-row grid of equal tracks, identical in every column;
 * - each line clips to one line (`truncate`), so a long title can never push
 *   the secondary line down;
 * - an absent secondary still occupies its track, so a row with no tracking
 *   number keeps its neighbours' baselines.
 *
 * The row shell is `items-stretch`, so one compound cell claiming
 * {@link COMPOUND_ROW_PX} sets the whole row's height — no per-row wrapper.
 */

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';

/**
 * Two equal tracks inside the 48px compound row. The parent select stack
 * (checkbox over fold chevron) must paint this same grid so the check sits
 * on the order-id line and the chevron sits on "2 boxes".
 */
export const COMPOUND_TWO_LINE_CLASS = 'grid h-full grid-rows-2 gap-0';

export interface CompoundCellProps {
  /** Top line — the identifying fact. */
  primary: ReactNode;
  /** Bottom line — the qualifier. Absent content still holds its track. */
  secondary?: ReactNode;
  align?: 'start' | 'end' | 'center';
  className?: string;
}

export function CompoundCell({
  primary,
  secondary,
  align = 'start',
  className,
}: CompoundCellProps) {
  const justify =
    align === 'end'
      ? 'justify-end text-right'
      : align === 'center'
        ? 'justify-center text-center'
        : 'justify-start text-left';
  return (
    <div
      // `h-full`, NOT a min-height. The wrapper cell owns the row box
      // (`COMPOUND_ROW_PX`, border-box, see `CompoundGridCell`); a min-height
      // here would re-declare that number from inside and, because the cell's
      // bottom rule eats a pixel of it, would overflow the box it is supposed to
      // fit — which is the shape of the bug that made every compound row paint
      // 61px against a 48px constant.
      className={cn(COMPOUND_TWO_LINE_CLASS, 'items-center min-w-0', className)}
    >
      <div
        className={cn(
          'flex min-w-0 items-center gap-1.5 text-sm font-medium text-text-default',
          justify,
        )}
      >
        {primary}
      </div>
      {/* `relative` is load-bearing: `LedgerCellEditor` overlays `absolute
          inset-0`, and scoping it to THIS line means editing the note never
          covers the title above it. */}
      <div
        className={cn(
          'relative flex min-w-0 items-center gap-1.5 text-xs text-text-muted',
          justify,
        )}
      >
        {secondary}
      </div>
    </div>
  );
}

/**
 * One line of a compound cell that must not wrap or grow the row.
 * `min-w-0` is load-bearing: without it a flex child refuses to shrink below
 * its content and `truncate` silently does nothing.
 */
export function CompoundLine({
  children,
  mono = false,
  className,
}: {
  children: ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('min-w-0 truncate', mono && 'font-mono tabular-nums', className)}>
      {children}
    </span>
  );
}
