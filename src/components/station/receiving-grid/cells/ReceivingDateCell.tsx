'use client';

import { GridDateCellValue } from '@/components/ui/grid-cells';
import { ReceivingChipValue } from './ReceivingChipValue';
import {
  receivingCellWantsChip,
  receivingDataCellClass,
  type ReceivingGridCellProps,
} from './receiving-grid-cell-types';

export function ReceivingDateCell({ col, rule, ctx }: ReceivingGridCellProps) {
  const chip = receivingCellWantsChip(col, ctx);
  return (
    <div data-col="date" className={receivingDataCellClass(col, rule, ctx)}>
      <ReceivingChipValue enabled={chip}>
        <GridDateCellValue
          label={ctx.dateCell?.label}
          tooltip={ctx.dateCell?.tooltip}
          className="text-role-caption"
        />
      </ReceivingChipValue>
    </div>
  );
}
