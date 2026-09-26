'use client';

import { ledgerCell } from '@/design-system/tokens/typography/presets';
import {
  receivingDataCellClass,
  receivingDataCellStyle,
  type ReceivingGridCellProps,
} from './receiving-grid-cell-types';

/** Product title — scrollable fact track on Receiving (identity pane is `select · order`). */
export function ReceivingTitleCell({ col, rule, ctx }: ReceivingGridCellProps) {
  return (
    <div
      data-col="title"
      className={receivingDataCellClass(col, rule, ctx)}
      style={receivingDataCellStyle(col, ctx)}
    >
      <span className={ledgerCell}>{ctx.productTitle}</span>
    </div>
  );
}
