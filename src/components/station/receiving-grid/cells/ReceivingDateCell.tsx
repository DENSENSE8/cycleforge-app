'use client';

import { GridDateCellValue } from '@/components/ui/grid-cells';
import { receivingDataCellClass, type ReceivingGridCellProps } from './receiving-grid-cell-types';

export function ReceivingDateCell({ col, rule, ctx }: ReceivingGridCellProps) {
  return (
    <div data-col="date" className={receivingDataCellClass(col, rule)}>
      <GridDateCellValue
        label={ctx.dateCell?.label}
        tooltip={ctx.dateCell?.tooltip}
        className="text-role-caption"
      />
    </div>
  );
}
