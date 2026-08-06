'use client';

import { GridDateCellValue } from '@/components/ui/grid-cells';
import { ReceivingChipValue } from './ReceivingChipValue';
import {
  receivingCellWantsChip,
  receivingDataCellClass,
  receivingDataCellStyle,
  type ReceivingGridCellProps,
} from './receiving-grid-cell-types';

/**
 * **When** the row reached its stage — civil day in a narrow scrollable track
 * (`Aug 4`). Full day + time lives on the tooltip (`dateCell.tooltip` /
 * `stageTip`).
 *
 * The time half moved here from `status` on 2026-08-02, when state and stamp
 * were split back apart ({@link ReceivingStatusCell} carries the reasoning).
 * Identity pane is `select · order` — Date scrolls with Product / facts.
 *
 * `--:--` is the stage formatter's empty face, not a time; it is dropped rather
 * than rendered, leaving the day alone (or the dash if there is no day either).
 */
export function ReceivingDateCell({ col, rule, ctx }: ReceivingGridCellProps) {
  const chip = receivingCellWantsChip(col, ctx);
  const day = ctx.dateCell?.label;
  const time = ctx.stageDisplay && ctx.stageDisplay !== '--:--' ? ctx.stageDisplay : null;
  const stampTooltip = [day, time].filter(Boolean).join(' ') || undefined;
  return (
    <div
      data-col="date"
      className={receivingDataCellClass(col, rule, ctx)}
      style={receivingDataCellStyle(col, ctx)}
    >
      <ReceivingChipValue enabled={chip}>
        <GridDateCellValue
          label={day || undefined}
          tooltip={ctx.dateCell?.tooltip || stampTooltip || ctx.stageTip}
          className="whitespace-nowrap tabular-nums text-role-caption"
        />
      </ReceivingChipValue>
    </div>
  );
}
