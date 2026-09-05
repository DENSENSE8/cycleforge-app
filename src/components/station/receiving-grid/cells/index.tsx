'use client';

/**
 * Receiving / Incoming cell paint — family ADAPTER only.
 *
 * There is no second table here. Column keys that are compound tracks go through
 * {@link renderCompoundGridCell}. Custom fields stay {@link CustomFieldCell}.
 * `_fill` is the shared slack track. Do not add a `Receiving*Cell` switch.
 */

import type { ReactNode } from 'react';
import { GridFillCell } from '@/design-system/components/grid';
import { isCompoundColumnModel } from '@/components/tables/compound/compound-columns';
import {
  isCompoundCellKey,
  renderCompoundGridCell,
} from '@/components/tables/compound/CompoundGridCell';
import type { CompoundRowView } from '@/components/tables/compound/compound-row-model';
import { CustomFieldCell } from '@/components/tables/CustomFieldCell';
import { incomingStateFace } from '@/lib/receiving/incoming-compound-view';
import { receivingCompoundView } from '@/lib/receiving/receiving-compound-view';
import type { IncomingGridColumn, ReceivingGridColumn } from '@/lib/receiving/receiving-grid-layout';
import { INCOMING_FIELD_CATALOG } from '@/lib/tables/field-catalog/incoming';
import { incomingSlotValuesFor, resolveIncomingSlotValue } from '@/lib/tables/field-catalog/incoming-resolve';
import { RECEIVING_FIELD_CATALOG } from '@/lib/tables/field-catalog/receiving';
import { receivingSlotValuesFor, resolveReceivingSlotValue } from '@/lib/tables/field-catalog/receiving-resolve';
import { lineMoneyField } from '@/lib/tables/slot-table-line-money';
import { lineQtyField, slotSubtitlePartsFor } from '@/lib/tables/slot-table-line-qty';
import {
  isCustomFieldColumnKey,
  parseCustomFieldDefKey,
} from '@/lib/tables/custom-field-keys';
import {
  receivingDataCellClass,
  receivingDataCellStyle,
  type ReceivingGridCellColumn,
  type ReceivingGridCellCtx,
} from './receiving-grid-cell-types';

export type { ReceivingGridCellCtx } from './receiving-grid-cell-types';
export {
  displayReceivingProductTitle,
  incomingDateCell,
  receivingStageTooltip,
} from './receiving-grid-row-helpers';

export { isCompoundCellKey };

function fallbackSubtitleFieldIds(incoming: boolean): string[] {
  const catalog = incoming ? INCOMING_FIELD_CATALOG : RECEIVING_FIELD_CATALOG;
  return [lineQtyField(catalog)?.id, lineMoneyField(catalog)?.id].filter(
    (id): id is string => Boolean(id),
  );
}

function viewFor(ctx: ReceivingGridCellCtx): CompoundRowView {
  const incoming = ctx.linePhase === 'expected';
  const state = incoming ? incomingStateFace(ctx.row) : null;
  const fieldIds =
    ctx.subtitleFieldIds && ctx.subtitleFieldIds.length > 0
      ? ctx.subtitleFieldIds
      : fallbackSubtitleFieldIds(incoming);
  const subtitleParts = slotSubtitlePartsFor(fieldIds, (fieldId) =>
    incoming
      ? resolveIncomingSlotValue(ctx.row, fieldId)
      : resolveReceivingSlotValue(ctx.row, fieldId),
  );

  return {
    slots: incoming
      ? incomingSlotValuesFor(ctx.row, ctx.columns ?? [])
      : receivingSlotValuesFor(ctx.row, ctx.columns ?? []),
    ...receivingCompoundView(ctx.row, {
      title: ctx.productTitle,
      stateLabel: state ? state.label : ctx.stageLabel,
      stateTone: state ? state.tone : undefined,
      stateTip: state ? state.tip : undefined,
      delayDays: incoming ? (ctx.daysLate ?? null) : null,
      delayTip: (incoming ? ctx.ageTooltip : ctx.stageTip) || undefined,
      tracking: (ctx.trackingValue || '').trim() || null,
      orderId: ctx.poValue || null,
    }),
    ...(ctx.quietIdentity ? { quietIdentity: true } : null),
    ...(subtitleParts.length > 0 ? { subtitleParts } : null),
  };
}

function selectFor(ctx: ReceivingGridCellCtx) {
  return {
    checked: ctx.isChecked,
    onToggle: ctx.clickSelect ? undefined : ctx.onToggle,
    label: ctx.isChecked
      ? `Deselect receiving line ${ctx.row.id}`
      : `Select receiving line ${ctx.row.id} for bulk actions`,
  };
}

const EMPTY_VIEW: CompoundRowView = {
  id: '',
  thumbUrl: null,
  title: '',
  note: null,
  orderId: null,
  tracking: null,
  platformValue: null,
  carrier: null,
  stateLabel: '',
  stateTone: 'neutral',
  delay: null,
  amount: null,
};

function claimsCompoundCell(
  key: string,
  columns: readonly { key: string }[] | undefined,
): boolean {
  if (isCompoundCellKey(key)) return true;
  return key === 'select' && isCompoundColumnModel(columns ?? []);
}

function renderReceivingCompoundCell(
  col: ReceivingGridCellColumn,
  rule: boolean,
  ctx: ReceivingGridCellCtx,
): ReactNode {
  const columns = ctx.columns ?? [col];
  return renderCompoundGridCell({
    col,
    columns,
    rule,
    view: col.key === 'select' ? EMPTY_VIEW : viewFor(ctx),
    onOpen: ctx.onOpenRecord,
    select: selectFor(ctx),
  });
}

export function renderReceivingGridCell(
  col: ReceivingGridColumn | IncomingGridColumn,
  last: boolean,
  ctx: ReceivingGridCellCtx,
): ReactNode {
  const rule = !last;
  if (col.key === '_fill') return <GridFillCell />;
  if (claimsCompoundCell(col.key, ctx.columns)) {
    return renderReceivingCompoundCell(col, rule, ctx);
  }
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
