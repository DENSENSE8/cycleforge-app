'use client';

import { Check } from '@/components/Icons';
import { GridRowCheckbox, isEmptyGutterChrome } from '@/components/ui/GridRowCheckbox';
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
 *
 * Chrome: Unbox History passes `selectGutterChrome: 'sheets'` (empty hit-plane;
 * row wash is the select signal); other surfaces keep `'always'`.
 */
export function ReceivingSelectCell({ ctx }: ReceivingGridCellProps) {
  const {
    selectMode,
    isChecked,
    onToggle,
    row,
    selectGutterChrome = 'always',
    clickSelect = false,
  } = ctx;
  const emptyGutter = isEmptyGutterChrome(selectGutterChrome);

  // Click-select: the row body owns bulk toggle; gutter is a spacer so the
  // header select-all still aligns on the select track.
  if (clickSelect) {
    return (
      <div
        className={cn(
          receivingGridCell({ inset: 'none', rule: true }),
          RECEIVING_GRID_FROZEN_CELL,
        )}
        style={{ left: receivingGridFrozenLeft('select') }}
        data-frozen-edge
        aria-hidden
      />
    );
  }

  return (
    <div
      className={cn(
        receivingGridCell({ inset: 'none', rule: true }),
        RECEIVING_GRID_FROZEN_CELL,
        emptyGutter ? 'items-stretch p-0' : 'justify-center',
      )}
      style={{ left: receivingGridFrozenLeft('select') }}
      data-frozen-edge
    >
      {selectMode && onToggle ? (
        <GridRowCheckbox
          checked={isChecked}
          onToggle={onToggle}
          label={`Select receiving line ${row.id} for bulk actions`}
          chrome={selectGutterChrome}
        />
      ) : selectMode ? (
        // Legacy single-gesture surface (Testing / Pickup / non-Unbox):
        // the ROW click still ticks the box, so this stays a painted indicator
        // and must not swallow the click that does the ticking. Unbox History
        // always passes `onToggle` — it never lands here.
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
