'use client';

import { GridFillCell } from '@/design-system/components/grid';
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
  claimsCompoundCell,
  renderReceivingCompoundCell,
} from './ReceivingCompoundCells';
import {
  receivingDataCellClass,
  receivingDataCellStyle,
  type ReceivingGridCellCtx,
} from './receiving-grid-cell-types';

export type { ReceivingGridCellCtx } from './receiving-grid-cell-types';
export { receivingCompoundRowView } from './ReceivingCompoundCells';
export {
  displayReceivingProductTitle,
  receivingStageTooltip,
} from './receiving-grid-row-helpers';

/**
 * Dispatch one Unbox / History / Testing LedgerGrid cell by column
 * key. Row shell builds {@link ReceivingGridCellCtx}; edit the matching
 * `*Cell.tsx`.
 */
export function renderReceivingGridCell(
  col: ReceivingGridColumn,
  last: boolean,
  ctx: ReceivingGridCellCtx,
  detail?: {
    open: boolean;
    onToggle: () => void;
    label: string;
  },
): ReactNode {
  const rule = !last;
  const props = { col, rule, ctx };
  // Compound (two-row) tracks — the shared renderer paints them, wrapper and
  // all. Checked BEFORE the flat switch on purpose: presentation swaps by
  // column model, so the row shell and the engine below it never learn which
  // layout is mounted.
  //
  // `select` is claimed only under a compound model — the FLAT Unbox / Testing
  // / Pickup grids keep `ReceivingSelectCell` and its 16px checklist square.
  if (claimsCompoundCell(col.key, ctx.columns)) {
    return renderReceivingCompoundCell(col, rule, ctx, detail);
  }
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
            style={receivingDataCellStyle(col, ctx)}
          >
            <CustomFieldCell
              column={col}
              values={ctx.row.customFields}
              fieldType={fieldType}
              className="px-0"
            />
          </div>
        );
      }
      return (
        <span
          className={receivingDataCellClass(col, rule, ctx)}
          style={receivingDataCellStyle(col, ctx)}
        />
      );
    }
  }
}
