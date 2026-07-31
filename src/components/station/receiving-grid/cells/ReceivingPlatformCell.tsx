'use client';

import { GridPlatformMarkValue } from '@/components/ui/grid-cells';
import { receivingDataCellClass, type ReceivingGridCellProps } from './receiving-grid-cell-types';

export function ReceivingPlatformCell({ col, rule, ctx }: ReceivingGridCellProps) {
  return (
    <div data-col="platform" className={receivingDataCellClass(col, rule)}>
      <GridPlatformMarkValue platformValue={ctx.platformMeta.value} label={ctx.markLabel} />
    </div>
  );
}
