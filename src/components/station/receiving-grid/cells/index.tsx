'use client';

import { GridFillCell } from '@/design-system/components/grid';
import type { ReactNode } from 'react';
import type { IncomingGridColumn, ReceivingGridColumn } from '@/lib/receiving/receiving-grid-layout';
import { CustomFieldCell } from '@/components/tables/CustomFieldCell';
import {
  isCustomFieldColumnKey,
  parseCustomFieldDefKey,
} from '@/lib/tables/custom-field-keys';
import { ReceivingAgeCell } from './ReceivingAgeCell';
import { ReceivingConditionCell } from './ReceivingConditionCell';
import { ReceivingDateCell } from './ReceivingDateCell';
import { ReceivingDeliveryStatusCell } from './ReceivingDeliveryStatusCell';
import { ReceivingLocationCell } from './ReceivingLocationCell';
import { ReceivingOrderCell } from './ReceivingOrderCell';
import { ReceivingPlatformCell } from './ReceivingPlatformCell';
import { ReceivingPriceCell } from './ReceivingPriceCell';
import { ReceivingQtyCell } from './ReceivingQtyCell';
import { ReceivingRemovedCell } from './ReceivingRemovedCell';
import { ReceivingSelectCell } from './ReceivingSelectCell';
import { ReceivingSerialCell } from './ReceivingSerialCell';
import { ReceivingStatusCell } from './ReceivingStatusCell';
import { ReceivingTitleCell } from './ReceivingTitleCell';
import { ReceivingTrackingCell } from './ReceivingTrackingCell';
import { ReceivingZohoCell } from './ReceivingZohoCell';
import {
  receivingDataCellClass,
  receivingDataCellHighlightStyle,
  type ReceivingGridCellCtx,
} from './receiving-grid-cell-types';

export type { ReceivingGridCellCtx } from './receiving-grid-cell-types';
export {
  displayReceivingProductTitle,
  incomingDateCell,
  receivingStageTooltip,
} from './receiving-grid-row-helpers';

/**
 * Dispatch one Unbox / History / Testing / Incoming LedgerGrid cell by column
 * key. Row shell builds {@link ReceivingGridCellCtx}; edit the matching
 * `*Cell.tsx`. Expected-phase `status` is delivery_state — never
 * {@link ReceivingStatusCell}.
 */
export function renderReceivingGridCell(
  col: ReceivingGridColumn | IncomingGridColumn,
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
    case 'age':
      return <ReceivingAgeCell {...props} />;
    case 'qty':
      return <ReceivingQtyCell {...props} />;
    case 'price':
      return <ReceivingPriceCell {...props} />;
    case 'condition':
      return <ReceivingConditionCell {...props} />;
    case 'status':
      return ctx.linePhase === 'expected'
        ? (
            <div
              data-col="status"
              className={receivingDataCellClass(col, rule, ctx)}
              style={receivingDataCellHighlightStyle(col, ctx)}
            >
              <ReceivingDeliveryStatusCell row={ctx.row} />
            </div>
          )
        : <ReceivingStatusCell {...props} />;
    case 'platform':
      return <ReceivingPlatformCell {...props} />;
    case 'removed':
      return <ReceivingRemovedCell {...props} />;
    case 'location':
      return <ReceivingLocationCell {...props} />;
    case 'order':
      return <ReceivingOrderCell {...props} />;
    case 'tracking':
      return <ReceivingTrackingCell {...props} />;
    case 'serial':
      return <ReceivingSerialCell {...props} />;
    case 'zoho':
      return <ReceivingZohoCell {...props} />;
    case '_fill':
      // Structural slack track — the shared cell, not a per-family copy.
      return <GridFillCell />;
    default: {
      if (isCustomFieldColumnKey(col.key)) {
        const defKey = parseCustomFieldDefKey(col.key);
        const fieldType = defKey
          ? ctx.customFieldDefs?.find((d) => d.key === defKey)?.type
          : undefined;
        return (
          <div
            className={receivingDataCellClass(col, rule, ctx)}
            style={receivingDataCellHighlightStyle(col, ctx)}
          >
            <CustomFieldCell
              column={col}
              values={ctx.row.customFields}
              fieldType={fieldType}
              className="px-0"
              onCommit={ctx.onCustomFieldCommit}
            />
          </div>
        );
      }
      return (
        <span
          className={receivingDataCellClass(col, rule, ctx)}
          style={receivingDataCellHighlightStyle(col, ctx)}
        />
      );
    }
  }
}
