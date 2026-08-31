'use client';

import { GridPlatformMarkValue } from '@/components/ui/grid-cells';
import {
  receivingDataCellClass,
  receivingDataCellStyle,
  type ReceivingGridCellProps,
} from './receiving-grid-cell-types';

/** Incoming Platform track — catalog brand mark. */
export function ReceivingPlatformCell({ col, rule, ctx }: ReceivingGridCellProps) {
  return (
    <div
      data-col="platform"
      className={receivingDataCellClass(col, rule, ctx)}
      style={receivingDataCellStyle(col, ctx)}
    >
      <GridPlatformMarkValue
        platformValue={ctx.platformMeta.value}
        label={ctx.markLabel ?? ctx.platformLabel}
        meta={ctx.platformMeta}
      />
    </div>
  );
}
