'use client';

import { SerialChip } from '@/components/ui/CopyChip';
import { GridCellDash } from '@/components/ui/grid-cells';
import { receivingDataCellClass,
  receivingDataCellStyle, type ReceivingGridCellProps } from './receiving-grid-cell-types';

export function ReceivingSerialCell({ col, rule, ctx }: ReceivingGridCellProps) {
  const { serialsCsv } = ctx;
  return (
    <div data-col="serial" className={receivingDataCellClass(col, rule, ctx)}
      style={receivingDataCellStyle(col, ctx)}>
      {serialsCsv ? (
        <SerialChip value={serialsCsv} width="w-auto shrink-0" dense plain={!!col.omitCellIcon} />
      ) : (
        <GridCellDash />
      )}
    </div>
  );
}
