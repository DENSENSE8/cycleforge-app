'use client';

import { OrderIdChip, getLast4 } from '@/components/ui/CopyChip';
import { receivingDataCellClass, type ReceivingGridCellProps } from './receiving-grid-cell-types';

export function ReceivingOrderCell({ col, rule, ctx }: ReceivingGridCellProps) {
  const { poValue } = ctx;
  return (
    <div data-col="order" className={receivingDataCellClass(col, rule)}>
      <OrderIdChip
        value={poValue}
        display={getLast4(poValue)}
        plain
        truncateDisplay={false}
        fitDisplayWidth
      />
    </div>
  );
}
