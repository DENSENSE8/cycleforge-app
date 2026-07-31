'use client';

import {
  RECEIVING_GRID_FROZEN_CELL,
  receivingGridFrozenLeft,
} from '@/lib/receiving/receiving-grid-layout';
import { cn } from '@/utils/_cn';
import { receivingDataCellClass, type ReceivingGridCellProps } from './receiving-grid-cell-types';

/**
 * Identity column — collection-map read-only
 * (`isGridColumnInCellEditable` / GRID_IDENTITY_COLUMN_KEYS). Clicks fall
 * through to the row (open record); title correction is rematch / catalog at
 * the record plane, not an in-cell caret.
 */
export function ReceivingTitleCell({ col, rule, ctx }: ReceivingGridCellProps) {
  return (
    <div
      data-col="title"
      className={cn(receivingDataCellClass(col, rule), RECEIVING_GRID_FROZEN_CELL, 'gap-1.5')}
      style={{ left: receivingGridFrozenLeft('title') }}
      data-frozen-edge
    >
      <span className={cn('h-2 w-2 shrink-0 rounded-full', ctx.statusDot)} aria-hidden />
      <span className="min-w-0 flex-1 truncate text-role-data text-text-default">
        {ctx.productTitle}
      </span>
    </div>
  );
}
