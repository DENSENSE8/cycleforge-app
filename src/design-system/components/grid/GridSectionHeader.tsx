'use client';

/** Labelled **section** band header for a grid. */

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
