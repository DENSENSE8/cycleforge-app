'use client';

import { GridQtyFractionValue } from '@/components/ui/grid-cells';
import { ReceivingChipValue } from './ReceivingChipValue';
import {
  receivingCellWantsChip,
  receivingDataCellClass,
  type ReceivingGridCellProps,
} from './receiving-grid-cell-types';

export function ReceivingQtyCell({ col, rule, ctx }: ReceivingGridCellProps) {
  const { row } = ctx;
  const chip = receivingCellWantsChip(col, ctx);
  return (
    <div data-col="qty" className={receivingDataCellClass(col, rule, ctx)}>
      <ReceivingChipValue enabled={chip}>
        <GridQtyFractionValue received={row.quantity_received} expected={row.quantity_expected} />
      </ReceivingChipValue>
    </div>
  );
}
