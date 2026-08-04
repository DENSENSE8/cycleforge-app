'use client';

import { OrderIdChip, getLast8 } from '@/components/ui/CopyChip';
import {
  receivingDataCellClass,
  receivingDataCellHighlightStyle,
  type ReceivingGridCellProps,
} from './receiving-grid-cell-types';

/**
 * The PO number — scrollable fact track on the Sheets-class Receiving grid
 * (only `select` is frozen). Still never in-cell editable on the collection
 * map (correction at the record plane).
 */
export function ReceivingOrderCell({ col, rule, ctx }: ReceivingGridCellProps) {
  const { poValue } = ctx;
  return (
    <div
      data-col="order"
      className={receivingDataCellClass(col, rule, ctx)}
      style={receivingDataCellHighlightStyle(col, ctx)}
    >
      <OrderIdChip
        value={poValue}
        display={getLast8(poValue)}
        plain
        truncateDisplay={false}
        fitDisplayWidth
      />
    </div>
  );
}
