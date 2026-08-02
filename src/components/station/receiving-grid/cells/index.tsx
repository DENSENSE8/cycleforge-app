'use client';

import type { ReactNode } from 'react';
import type { ReceivingGridColumn } from '@/lib/receiving/receiving-grid-layout';
import { ReceivingConditionCell } from './ReceivingConditionCell';
import { ReceivingDateCell } from './ReceivingDateCell';
import { ReceivingLocationCell } from './ReceivingLocationCell';
import { ReceivingOrderCell } from './ReceivingOrderCell';
import { ReceivingPlatformCell } from './ReceivingPlatformCell';
import { ReceivingQtyCell } from './ReceivingQtyCell';
import { ReceivingSelectCell } from './ReceivingSelectCell';
import { ReceivingSerialCell } from './ReceivingSerialCell';
import { ReceivingStageCell } from './ReceivingStageCell';
import { ReceivingStatusCell } from './ReceivingStatusCell';
import { ReceivingTitleCell } from './ReceivingTitleCell';
import { ReceivingTrackingCell } from './ReceivingTrackingCell';
import {
  receivingDataCellClass,
  type ReceivingGridCellCtx,
} from './receiving-grid-cell-types';

export type { ReceivingGridCellCtx } from './receiving-grid-cell-types';
export {
  displayReceivingProductTitle,
  receivingStageTooltip,
} from './receiving-grid-row-helpers';

/**
 * Dispatch one Unbox / History / Testing LedgerGrid cell by column key.
 * Row shell builds {@link ReceivingGridCellCtx}; edit the matching `*Cell.tsx`.
 */
export function renderReceivingGridCell(
  col: ReceivingGridColumn,
  last: boolean,
  ctx: ReceivingGridCellCtx,
): ReactNode {
  const rule = !last;
  const props = { col, rule, ctx };
  switch (col.key) {
    case 'select':
      return <ReceivingSelectCell {...props} />;
    case 'title':
      return <ReceivingTitleCell {...props} />;
    case 'date':
      return <ReceivingDateCell {...props} />;
    case 'qty':
      return <ReceivingQtyCell {...props} />;
    case 'condition':
      return <ReceivingConditionCell {...props} />;
    case 'stage':
      return <ReceivingStageCell {...props} />;
    case 'status':
      return <ReceivingStatusCell {...props} />;
    case 'location':
      return <ReceivingLocationCell {...props} />;
    case 'platform':
      return <ReceivingPlatformCell {...props} />;
    case 'order':
      return <ReceivingOrderCell {...props} />;
    case 'tracking':
      return <ReceivingTrackingCell {...props} />;
    case 'serial':
      return <ReceivingSerialCell {...props} />;
    default:
      return <span className={receivingDataCellClass(col, rule, ctx)} />;
  }
}
