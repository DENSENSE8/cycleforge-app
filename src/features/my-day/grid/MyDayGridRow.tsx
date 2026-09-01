'use client';

import { Fragment, memo, type ReactNode } from 'react';
import { OrderIdChip, TicketChip, getLast8 } from '@/components/ui/CopyChip';
import {
  GridCellDash,
  GridDateCellValue,
  GridStatusCellValue,
} from '@/components/ui/grid-cells';
import { ledgerRowFillClass } from '@/components/ui/queue-row-chrome';
import { gridCellAlignClass } from '@/design-system/components/grid';
import { workStatusChipClass, workStatusLabel } from '@/lib/work-orders/work-status-display';
import {
  myDayLaneChipClass,
  myDayLaneDot,
  myDayLaneShortLabel,
  type MyDayTask,
} from '@/lib/my-day/my-day-tasks';
import {
  MY_DAY_GRID_FROZEN_CELL,
  myDayGridCell,
  myDayGridFrozenLeft,
  myDayGridRowShellClass,
  myDayGridTemplate,
  type MyDayGridColumn,
} from '@/lib/my-day/my-day-grid-layout';
import { resolveMyDaySlotValue } from '@/lib/tables/field-catalog/my-day-resolve';
import { isSlotTrackKey } from '@/lib/tables/materialize-tracks';
import { formatDateKeyShort, formatDateTimePST, toPSTDateKey } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { MY_DAY_GRID_CAPABILITIES } from './my-day-grid-descriptor';

const dataCell = (col: MyDayGridColumn, rule = true) =>
  cn(myDayGridCell({ rule, inset: 'grid' }), gridCellAlignClass(col));

/**
 * One Today task — CSS-grid columns matching {@link MY_DAY_GRID_COLUMNS}.
 *
 * Read-only by contract: the surface declares `inCellEdit: false`, so no cell
 * mounts a `LedgerCellEditor`. Clicking the row selects it (the inspector is the
 * record plane); opening the work happens from there.
 */
export const MyDayGridRow = memo(function MyDayGridRow({
  task,
  isSelected,
  onSelect,
  columns,
}: {
  task: MyDayTask;
  isSelected: boolean;
  onSelect: (task: MyDayTask) => void;
  columns: readonly MyDayGridColumn[];
}) {
  const dueKey = task.deadlineAt ? toPSTDateKey(task.deadlineAt) : null;
  const status = workStatusLabel(task.status);

  /** The body of one materialized slot track, chosen by the BOUND FIELD. */
  const renderSlotBody = (fieldId: string | undefined): ReactNode => {
    switch (fieldId) {
      case 'my-day.lane':
        return (
          <GridStatusCellValue
            label={myDayLaneShortLabel(task.lane)}
            toneClass={myDayLaneChipClass(task.lane)}
            dotClass={myDayLaneDot(task.lane)}
          />
        );
      case 'my-day.queue':
        return (
          <span className="min-w-0 truncate text-role-caption text-text-muted">
            {task.queueLabel}
          </span>
        );
      case 'my-day.record':
        return task.recordLabel == null ? (
          <GridCellDash />
        ) : task.source.kind === 'interrupt' ? (
          <TicketChip value={task.recordLabel} display={task.recordLabel} dense />
        ) : (
          <OrderIdChip
            value={task.recordLabel}
            display={getLast8(task.recordLabel)}
            plain
            truncateDisplay={false}
            fitDisplayWidth
          />
        );
      case 'my-day.due':
        return (
          <GridDateCellValue
            label={dueKey ? formatDateKeyShort(dueKey) : null}
            tooltip={task.deadlineAt ? formatDateTimePST(task.deadlineAt) : null}
            className="text-role-caption"
          />
        );
      case 'my-day.status':
        // An interrupt has no status machine — a dash, never a borrowed
        // work-order word.
        return status ? (
          <GridStatusCellValue label={status} toneClass={workStatusChipClass(task.status)} />
        ) : (
          <GridCellDash />
        );
      default: {
        // A catalog field with no bespoke face paints its resolved text — a new
        // bindable fact needs a resolver case, never a new column file.
        const value = fieldId ? resolveMyDaySlotValue(task, fieldId) : null;
        const text = value?.kind === 'value' ? value.text : null;
        return text ? (
          <span className="min-w-0 truncate text-role-caption text-text-soft">{text}</span>
        ) : (
          <GridCellDash />
        );
      }
    }
  };

  const renderCell = (col: MyDayGridColumn, last: boolean): ReactNode => {
    const rule = !last;
    if (isSlotTrackKey(col.key)) {
      return (
        <div data-col={col.key} className={dataCell(col, rule)}>
          {renderSlotBody(col.fieldId)}
        </div>
      );
    }
    switch (col.key) {
      case 'select':
        return (
          <div
            className={cn(
              myDayGridCell({ inset: 'none', rule: true }),
              MY_DAY_GRID_FROZEN_CELL,
              'justify-center',
            )}
            style={{ left: myDayGridFrozenLeft(columns, 'select') }}
          >
            <span className="h-4 w-4 shrink-0" aria-hidden />
          </div>
        );
      case 'task':
        return (
          <div
            data-col="task"
            className={cn(dataCell(col, rule), MY_DAY_GRID_FROZEN_CELL, 'gap-1.5')}
            style={{ left: myDayGridFrozenLeft(columns, 'task') }}
            data-frozen-edge
          >
            <span className="min-w-0 flex-1 truncate text-role-data text-text-default">
              {task.title}
            </span>
            <span className="min-w-0 shrink truncate text-role-eyebrow uppercase tracking-widest text-text-faint">
              {task.subtitle}
            </span>
          </div>
        );
      default:
        return <span className={dataCell(col, rule)} />;
    }
  };

  return (
    <div
      data-my-day-task-id={task.id}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`Task ${task.title}`}
      onClick={() => onSelect(task)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(task);
        }
      }}
      className={cn(
        myDayGridRowShellClass(false, { scrollMinContent: true }),
        ledgerRowFillClass({ selected: isSelected, capabilities: MY_DAY_GRID_CAPABILITIES }),
      )}
      style={{ gridTemplateColumns: myDayGridTemplate(columns) }}
    >
      {columns.map((col, i) => (
        <Fragment key={col.key}>{renderCell(col, i === columns.length - 1)}</Fragment>
      ))}
    </div>
  );
});
