'use client';

import { GridDateCellValue } from '@/components/ui/grid-cells';
import { ReceivingChipValue } from './ReceivingChipValue';
import {
  receivingCellWantsChip,
  receivingDataCellClass,
  receivingDataCellHighlightStyle,
  type ReceivingGridCellProps,
} from './receiving-grid-cell-types';

/**
 * **When** the row reached its stage — day + time in one track (`Jul 31 4:19 PM`).
 *
 * The time half moved here from `status` on 2026-08-02, when state and stamp
 * were split back apart ({@link ReceivingStatusCell} carries the reasoning).
 * Both halves are the same stamp — `dateCell` and `stageDisplay` are derived
 * from one instant in `ReceivingGridRow` — so they belong to one cell, and it
 * is this one: an operator scans a column of times, not a column of sentences.
 *
 * `--:--` is the stage formatter's empty face, not a time; it is dropped rather
 * than rendered, leaving the day alone (or the dash if there is no day either).
 */
export function ReceivingDateCell({ col, rule, ctx }: ReceivingGridCellProps) {
  const chip = receivingCellWantsChip(col, ctx);
  const day = ctx.dateCell?.label;
  const time = ctx.stageDisplay && ctx.stageDisplay !== '--:--' ? ctx.stageDisplay : null;
  return (
    <div data-col="date" className={receivingDataCellClass(col, rule, ctx)}
      style={receivingDataCellHighlightStyle(col, ctx)}>
      <ReceivingChipValue enabled={chip}>
        <GridDateCellValue
          label={[day, time].filter(Boolean).join(' ') || undefined}
          tooltip={ctx.dateCell?.tooltip || ctx.stageTip}
          className="whitespace-nowrap text-role-caption"
        />
      </ReceivingChipValue>
    </div>
  );
}
