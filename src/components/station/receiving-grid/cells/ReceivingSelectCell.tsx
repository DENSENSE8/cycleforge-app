'use client';

import { Check } from '@/components/Icons';
import {
  RECEIVING_GRID_FROZEN_CELL,
  receivingGridCell,
  receivingGridFrozenLeft,
} from '@/lib/receiving/receiving-grid-layout';
import { cn } from '@/utils/_cn';
import type { ReceivingGridCellProps } from './receiving-grid-cell-types';

export function ReceivingSelectCell({ ctx }: ReceivingGridCellProps) {
  const { selectMode, isSelected } = ctx;
  return (
    <div
      className={cn(
        receivingGridCell({ inset: 'none', rule: true }),
        RECEIVING_GRID_FROZEN_CELL,
        'justify-center',
      )}
      style={{ left: receivingGridFrozenLeft('select') }}
      onClick={(e) => {
        if (selectMode) e.stopPropagation();
      }}
    >
      {selectMode ? (
        <span
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
            isSelected
              ? 'border-accent-bg bg-accent-bg text-text-inverse'
              : 'border-border-default bg-surface-card',
          )}
          aria-hidden
        >
          {isSelected ? <Check className="h-3 w-3" /> : null}
        </span>
      ) : (
        <span className="h-4 w-4 shrink-0" aria-hidden />
      )}
    </div>
  );
}
