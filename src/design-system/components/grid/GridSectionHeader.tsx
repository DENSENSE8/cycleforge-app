'use client';

/**
 * Labelled **section** band header for a grid.
 *
 * Distinct from {@link DateGroupHeader}, and the distinction is the whole
 * reason this exists: a day band answers *when* and formats its key through
 * `formatDateWithOrdinal`, so it can only ever say a date. A section band
 * answers *what this run of rows is* — "Added today" — and its key is a label,
 * not a date.
 *
 * The outbound spreadsheet runs with `showDayHeaders={false}` (absolute civil
 * date lives in a per-row Date column) and must keep it that way, yet still
 * needs to fence off the day's new arrivals at the top of the queue. Reusing
 * the day header would have meant turning day banding back on for the whole
 * table to label one section.
 *
 * ## Sentence case
 *
 * `dayGroupChipClass` is uppercase; this is not. Operator direction
 * 2026-08-31 — "no caps lock" — and the caption sits at `text-role-caption`,
 * the same role as the desk's CTA and its menu, so the desk speaks in one
 * voice.
 *
 * ## Chrome
 *
 * Paints the caption and the TOP and SIDE edges of the section's outline; the
 * side edges continue down the rows and the bottom edge closes on the last one
 * (owned by {@link VirtualGroupedSections}, since a virtualized list positions
 * every row absolutely and cannot wrap a subset in a box).
 *
 * Stickiness is the virtualizer shell's, and only for civil {@link DateGroupHeader}
 * day bands. This caption paints in-flow — "Added today" must not dock as a
 * second chrome row under the column header. It is on screen only while that
 * run of table rows is.
 */

import { cn } from '@/utils/_cn';
import { QUEUE_ROW } from '@/components/ui/queue-row-chrome';

export function GridSectionHeader({
  label,
  total,
  rowIndex,
}: {
  /** The section's name — a label, never a date. */
  label: string;
  /** Leaf rows in the section. */
  total: number;
  /** Absolute ARIA row index across the flattened stream. */
  rowIndex?: number;
}) {
  return (
    <div
      role="row"
      aria-rowindex={rowIndex}
      className={cn(
        'flex items-center gap-2 border-x border-t border-border-soft bg-surface-card py-1',
        QUEUE_ROW.px,
      )}
      data-testid="grid-section-header"
      data-section-label={label}
    >
      <span
        role="columnheader"
        className="text-role-caption font-semibold text-text-default"
      >
        {label}
      </span>
      <span className="tabular-nums text-role-caption text-text-muted">{total}</span>
    </div>
  );
}
