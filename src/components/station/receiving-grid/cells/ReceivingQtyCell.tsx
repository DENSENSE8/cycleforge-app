'use client';

import { GridQtyFractionValue } from '@/components/ui/grid-cells';
import {
  receivingDataCellClass,
  receivingDataCellStyle,
  type ReceivingGridCellProps,
} from './receiving-grid-cell-types';

export function ReceivingQtyCell({ col, rule, ctx }: ReceivingGridCellProps) {
  const { row } = ctx;
  return (
    <div data-col="qty" className={receivingDataCellClass(col, rule, ctx)}
      style={receivingDataCellStyle(col, ctx)}>
      <GridQtyFractionValue received={row.quantity_received} expected={row.quantity_expected} />
    </div>
  );
}
