'use client';

import { Fragment, memo, type ReactNode } from 'react';
import { OrderIdChip, getLast8 } from '@/components/ui/CopyChip';
import {
  GridCellDash,
  GridDateCellValue,
  GridStatusCellValue,
} from '@/components/ui/grid-cells';
import { ledgerRowFillClass } from '@/components/ui/queue-row-chrome';
import { PICKUP_GRID_CAPABILITIES } from '@/components/receiving/pickup/grid/pickup-grid-descriptor';
import { conditionLabel } from '@/lib/conditions';
import { conditionGradeTextClass } from '@/lib/condition-tone';
import type { RowGroup } from '@/lib/group-rows';
import {
  pickupOrderStatusChipClass,
  pickupOrderStatusDot,
  pickupOrderStatusLabel,
} from '@/lib/local-pickup/order-status';
import { resolvePickupSlotValue } from '@/lib/tables/field-catalog/pickup-resolve';
import { isSlotTrackKey } from '@/lib/tables/materialize-tracks';
import { formatDateKeyShort } from '@/utils/date';
import { gridCellAlignClass } from '@/design-system/components/grid';
import { gridFrozenLeft, gridTemplate } from '@/design-system/components/grid/grid-column-geometry';
import { cn } from '@/utils/_cn';
import { pickupMoney, type PickupLine } from '../pickup-lines';
import {
  PICKUP_GRID_FROZEN_CELL,
  PICKUP_SHEET_COLUMNS,
  pickupGridCell,
  pickupGridRowShellClass,
  type PickupGridColumn,
} from './pickup-grid-layout';

const dataCell = (col: PickupGridColumn, rule = true) =>
  cn(pickupGridCell({ rule, inset: 'grid' }), gridCellAlignClass(col));

/** The order's state — dot + chip through the house {@link GridStatusCellValue} (2026-08-02). */
function PickupStatusChip({
  orderStatus,
  receivingId,
}: {
  orderStatus: string;
  receivingId?: number | null;
}) {
  const opts = { receivingId: receivingId ?? null };
  return (
    <GridStatusCellValue
      label={pickupOrderStatusLabel(orderStatus, opts)}
      toneClass={pickupOrderStatusChipClass(orderStatus, opts)}
      dotClass={pickupOrderStatusDot(orderStatus, opts)}
    />
  );
}

/** One pickup product line — CSS-grid columns matching the MOUNTED slot materialization (`pickupSheetColumnsFor`; Wave-2 hand-model kill). */
const PickupGridLeafRow = memo(function PickupGridLeafRow({
  line,
  isSelected,
  onSelectOrder,
  columns = PICKUP_SHEET_COLUMNS,
}: {
  line: PickupLine;
  isSelected: boolean;
  onSelectOrder: (orderId: number) => void;
  columns?: readonly PickupGridColumn[];
}) {
  const condGrade = (line.condition_grade || '').toUpperCase();

  /** The family cell map for slot tracks — keyed by the BOUND field. */
  const renderSlotCellBody = (fieldId: string | undefined): ReactNode => {
    switch (fieldId) {
      case 'pickup.sku':
        return line.sku ? (
          <span className="min-w-0 truncate font-mono text-role-caption text-text-soft">
            {line.sku}
          </span>
        ) : (
          <GridCellDash />
        );
      case 'pickup.date':
        return (
          <GridDateCellValue
            label={line.pickup_date ? formatDateKeyShort(line.pickup_date) : null}
            tooltip={line.pickup_date}
            className="text-role-caption"
          />
        );
      case 'pickup.qty':
        return (
          <span className="min-w-0 truncate tabular-nums text-role-caption text-text-muted">
            {line.quantity}
          </span>
        );
      case 'pickup.condition':
        return (
          <span
            className={cn(
              'min-w-0 truncate text-role-eyebrow',
              conditionGradeTextClass(condGrade),
            )}
          >
            {conditionLabel(line.condition_grade, 'compact')}
          </span>
        );
      case 'pickup.price':
        return (
          <span className="tabular-nums text-role-caption font-semibold text-emerald-700">
            {pickupMoney(line.total_price)}
          </span>
        );
      case 'pickup.status':
        return (
          <PickupStatusChip
            orderStatus={line.order_status}
            receivingId={line.receiving_id}
          />
        );
      default: {
        // A catalog field with no bespoke face paints its resolved text — a
        // new bindable fact needs a resolver case, never a new column file.
        const value = fieldId ? resolvePickupSlotValue(line, fieldId) : null;
        const text = value?.kind === 'value' ? value.text : null;
        return text ? (
          <span className="min-w-0 truncate text-role-caption text-text-soft">{text}</span>
        ) : (
          <GridCellDash />
        );
      }
    }
  };

  const renderCell = (col: PickupGridColumn, last: boolean): ReactNode => {
    const rule = !last;
    if (isSlotTrackKey(col.key)) {
      return (
        <div data-col={col.key} className={dataCell(col, rule)}>
          {renderSlotCellBody(col.fieldId)}
        </div>
      );
    }
    switch (col.key) {
      case 'select':
        return (
          <div
            className={cn(
              pickupGridCell({ inset: 'none', rule: true }),
              PICKUP_GRID_FROZEN_CELL,
              'justify-center',
            )}
            // Offsets from the MOUNTED model, never a static list.
            style={{ left: gridFrozenLeft(columns, 'select') }}
          >
            <span className="h-4 w-4 shrink-0" aria-hidden />
          </div>
        );
      case 'title':
        return (
          <div
            data-col="title"
            className={cn(dataCell(col, rule), PICKUP_GRID_FROZEN_CELL)}
            style={{ left: gridFrozenLeft(columns, 'title') }}
            data-frozen-edge
          >
            <span className="min-w-0 flex-1 truncate text-role-data text-text-default">
              {line.product_title}
            </span>
          </div>
        );
      case 'order':
        return (
          <div data-col="order" className={dataCell(col, rule)}>
            <OrderIdChip
              value={line.po_number || ''}
              display={getLast8(line.po_number)}
              plain
              truncateDisplay={false}
              fitDisplayWidth
            />
          </div>
        );
      default:
        return <span className={dataCell(col, rule)} />;
    }
  };

  return (
    <div
      data-pickup-row-id={line.id}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`Local pickup line ${line.product_title}`}
      onClick={() => onSelectOrder(line.order_id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelectOrder(line.order_id);
        }
      }}
      className={cn(
        pickupGridRowShellClass(false, { scrollMinContent: true }),
        ledgerRowFillClass({
          selected: isSelected,
          capabilities: PICKUP_GRID_CAPABILITIES,
        }),
      )}
      style={{ gridTemplateColumns: gridTemplate(columns) }}
    >
      {columns.map((col, i) => (
        <Fragment key={col.key}>{renderCell(col, i === columns.length - 1)}</Fragment>
      ))}
    </div>
  );
});

/** One LCPU order inside the pickup LedgerGrid. */
export function PickupGridGroupRow({
  group,
  baseStripeIndex: _baseStripeIndex,
  selectedOrderId,
  onSelectOrder,
  columns = PICKUP_SHEET_COLUMNS,
}: {
  group: RowGroup<PickupLine>;
  /** Kept for LedgerGrid `renderGroup` signature parity (unused — flat leaves). */
  baseStripeIndex: number;
  selectedOrderId: number | null;
  onSelectOrder: (orderId: number) => void;
  columns?: readonly PickupGridColumn[];
}) {
  const orderId = group.rows[0]?.order_id ?? null;
  const isOrderSelected = orderId != null && orderId === selectedOrderId;

  return (
    <>
      {group.rows.map((line) => (
        <PickupGridLeafRow
          key={line.id}
          line={line}
          isSelected={isOrderSelected}
          onSelectOrder={onSelectOrder}
          columns={columns}
        />
      ))}
    </>
  );
}
