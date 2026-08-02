'use client';

import { Check } from '@/components/Icons';
import { GridRowCheckbox } from '@/components/ui/GridRowCheckbox';
import {
  RECEIVING_GRID_FROZEN_CELL,
  receivingGridCell,
  receivingGridFrozenLeft,
} from '@/lib/receiving/receiving-grid-layout';
import { cn } from '@/utils/_cn';
import type { ReceivingGridCellProps } from './receiving-grid-cell-types';

/**
 * The multi-select plane's affordance. It is a REAL control (`GridRowCheckbox`
 * stops propagation and calls `onToggle`) — it used to be a painted `span`
 * inside a cell that only swallowed the click, so the row underneath owned the
 * toggle and "open the record" had no gesture left.
 */
export function ReceivingSelectCell({ ctx }: ReceivingGridCellProps) {
  const { selectMode, isChecked, onToggle, row } = ctx;
  return (
    <div
      className={cn(
        receivingGridCell({ inset: 'none', rule: true }),
        RECEIVING_GRID_FROZEN_CELL,
        'justify-center',
      )}
      style={{ left: receivingGridFrozenLeft('select') }}
    >
      {selectMode && onToggle ? (
        <GridRowCheckbox
          checked={isChecked}
          onToggle={onToggle}
          label={`Select receiving line ${row.id} for bulk actions`}
        />
      ) : selectMode ? (
        // Legacy single-gesture surface (Unbox workbench / Testing / Pickup):
        // the ROW click still ticks the box, so this stays a painted indicator
        // and must not swallow the click that does the ticking.
        <span
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
            isChecked
              ? 'border-accent-bg bg-accent-bg text-text-inverse'
              : 'border-border-default bg-surface-card',
          )}
          aria-hidden
        >
          {isChecked ? <Check className="h-3 w-3" /> : null}
        </span>
      ) : (
        <span className="h-4 w-4 shrink-0" aria-hidden />
      )}
    </div>
  );
}
