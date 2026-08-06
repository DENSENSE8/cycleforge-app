'use client';

import { Check } from '@/components/Icons';
import {
  GridClickSelectFace,
  GridRowCheckbox,
  isEmptyGutterChrome,
} from '@/components/ui/GridRowCheckbox';
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
 * Click-select (Unbox History / Incoming): decorative {@link GridClickSelectFace}
 * in the select track; the row body owns bulk toggle. Other surfaces keep
 * interactive `'always'` chrome.
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

  // Click-select: the row body owns bulk toggle; gutter paints membership so
  // header select-all still aligns on the select track.
  if (clickSelect) {
    return (
      <div
        className={cn(
          receivingGridCell({ inset: 'none', rule: true }),
          RECEIVING_GRID_FROZEN_CELL,
          // Clip the absolute face to the 2rem track — in-flow full-bleed wash
          // was bleeding a selection strip into the next column under h-scroll.
          // `sticky` (from FROZEN_CELL) is already a containing block for the
          // absolute face — do NOT add `relative` here; it overrides sticky and
          // the select gutter scrolls away with the facts.
          'overflow-hidden p-0',
        )}
        style={{ left: receivingGridFrozenLeft('select') }}
        aria-hidden
      >
        <GridClickSelectFace
          checked={isChecked}
          className="absolute inset-0"
        />
      </div>
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
