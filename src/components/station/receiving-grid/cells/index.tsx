'use client';

import type { ReactNode } from 'react';
import type { ReceivingGridColumn } from '@/lib/receiving/receiving-grid-layout';
import { CustomFieldCell } from '@/components/tables/CustomFieldCell';
import {
  isCustomFieldColumnKey,
  parseCustomFieldDefKey,
} from '@/lib/tables/custom-field-keys';
import { ReceivingConditionCell } from './ReceivingConditionCell';
import { ReceivingDateCell } from './ReceivingDateCell';
import { ReceivingLocationCell } from './ReceivingLocationCell';
import { ReceivingOrderCell } from './ReceivingOrderCell';
import { ReceivingPriceCell } from './ReceivingPriceCell';
import { ReceivingQtyCell } from './ReceivingQtyCell';
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
    case 'price':
      return <ReceivingPriceCell {...props} />;
    case 'condition':
      return <ReceivingConditionCell {...props} />;
    case 'status':
      return <ReceivingStatusCell {...props} />;
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
      // Structural slack track — empty header/body; never a fact column.
      return (
        <div
          data-col="_fill"
          role="presentation"
          aria-hidden
          className={`${receivingDataCellClass(col, false, ctx)} min-h-0`}
        />
      );
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
