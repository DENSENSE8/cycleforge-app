'use client';

import { UnitPriceChip } from '@/components/ui/CopyChip';
import { GridCellDash } from '@/components/ui/grid-cells';
import {
  receivingDataCellClass,
  receivingDataCellStyle,
  type ReceivingGridCellProps,
} from './receiving-grid-cell-types';

function hasPositiveUnitPrice(raw: string | number | null | undefined): boolean {
  if (raw == null || raw === '') return false;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0;
}

/**
 * Price column — dense Sheets face keeps the Receipt mark omitted
 * (`omitCellIcon`); the header glyph still names the column type.
 */
export function ReceivingPriceCell({ col, rule, ctx }: ReceivingGridCellProps) {
  const amount = ctx.row.unit_price;
  return (
    <div
      data-col="price"
      className={receivingDataCellClass(col, rule, ctx)}
      style={receivingDataCellStyle(col, ctx)}
    >
      {hasPositiveUnitPrice(amount) ? (
        <UnitPriceChip
          amount={amount as string | number}
          dense
          showIcon={!col.omitCellIcon}
        />
      ) : (
        <GridCellDash />
      )}
    </div>
  );
}
