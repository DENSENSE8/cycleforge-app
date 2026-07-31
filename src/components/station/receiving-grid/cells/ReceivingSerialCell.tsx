'use client';

import { SerialChip } from '@/components/ui/CopyChip';
import { GridCellDash } from '@/components/ui/grid-cells';
import { receivingDataCellClass, type ReceivingGridCellProps } from './receiving-grid-cell-types';

export function ReceivingSerialCell({ col, rule, ctx }: ReceivingGridCellProps) {
  const { serialsCsv } = ctx;
  return (
    <div data-col="serial" className={receivingDataCellClass(col, rule)}>
      {serialsCsv ? (
        <SerialChip value={serialsCsv} width="w-auto shrink-0" dense />
      ) : (
        <GridCellDash />
      )}
    </div>
  );
}
