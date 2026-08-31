'use client';

import { GridAgeCellValue } from '@/components/ui/grid-cells';
import {
  receivingDataCellClass,
  receivingDataCellStyle,
  type ReceivingGridCellProps,
} from './receiving-grid-cell-types';

/** Incoming Age track — days-late / lane-age compact face. */
export function ReceivingAgeCell({ col, rule, ctx }: ReceivingGridCellProps) {
  return (
    <div
      data-col="age"
      className={receivingDataCellClass(col, rule, ctx)}
      style={receivingDataCellStyle(col, ctx)}
    >
      <GridAgeCellValue
        daysLate={ctx.daysLate ?? null}
        laneAgeLabel={ctx.laneAgeLabel}
        laneAgeHours={ctx.laneAgeHours}
        tooltip={ctx.ageTooltip}
        className="text-role-caption"
      />
    </div>
  );
}
