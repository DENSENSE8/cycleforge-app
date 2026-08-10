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
 * (`Aug 4`). Hover is a short day · time tip only; stage / staff detail opens
 * with the row. Identity pane is `select · order` — Date scrolls with facts.
 */
export function ReceivingDateCell({ col, rule, ctx }: ReceivingGridCellProps) {
  const chip = receivingCellWantsChip(col, ctx);
  const day = ctx.dateCell?.label;
  return (
    <div
      data-col="date"
      className={receivingDataCellClass(col, rule, ctx)}
      style={receivingDataCellStyle(col, ctx)}
    >
      <ReceivingChipValue enabled={chip}>
        <GridDateCellValue
          label={day || undefined}
          tooltip={ctx.dateCell?.tooltip}
          className="whitespace-nowrap tabular-nums text-role-caption"
        />
      </ReceivingChipValue>
    </div>
  );
}
