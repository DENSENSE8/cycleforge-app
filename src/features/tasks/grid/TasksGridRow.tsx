'use client';

import type { ReactNode } from 'react';
import { Checkbox } from '@/design-system/primitives';
import {
  GridCellDash,
  GridDateTimeCellValue,
  GridStatusCellValue,
} from '@/components/ui/grid-cells';
import { gridDataCellClass } from '@/design-system/components/grid';
import {
  workStatusChipClass,
  workStatusDot,
  workStatusLabel,
} from '@/lib/work-orders/work-status-display';
import { STATION_LABEL, type StationKey } from '@/components/layout/goal-chip/goal-chip-shared';
import {
  TASKS_GRID_COLUMNS,
  TASKS_GRID_FROZEN_CELL,
  tasksGridFrozenLeft,
  tasksGridRowShellClass,
  tasksGridTemplate,
  type TasksGridColumn,
} from '@/lib/staff-todos/tasks-grid-layout';
import type { StaffTaskRow } from './staff-task-row';
import { cn } from '@/utils/_cn';

/**
 * One My Tasks row.
 *
 * The gutter checkbox is the surface's PRIMARY VERB, not a selection — ticking
 * it checks the task off. Clicking anywhere ELSE opens the record in the right
 * rail, which is why the checkbox cell stops propagation: one row, two gestures,
 * and each one has to stay predictable.
 */
export function TasksGridRow({
  row,
  columns = TASKS_GRID_COLUMNS,
  isMobile = false,
  selected,
  togglePending,
  onToggle,
  onSelect,
}: {
  row: StaffTaskRow;
  columns?: readonly TasksGridColumn[];
  isMobile?: boolean;
  selected: boolean;
  togglePending: boolean;
  onToggle: (row: StaffTaskRow) => void;
  onSelect: (row: StaffTaskRow) => void;
}) {
  const dataCell = (col: TasksGridColumn, rule = true) =>
    gridDataCellClass(col, { rule, inset: 'grid', frozenClass: TASKS_GRID_FROZEN_CELL });

  const renderCell = (col: TasksGridColumn, last: boolean): ReactNode => {
    const rule = !last;
    switch (col.key) {
      case 'select':
        return (
          <div
            className={cn(dataCell(col, true), 'justify-center')}
            style={{ left: tasksGridFrozenLeft('select') }}
            // The verb lives here, so the click must not also open the record.
            onClick={(e) => e.stopPropagation()}
          >
            <Checkbox
              checked={row.done}
              disabled={row.archived || togglePending}
              onCheckedChange={() => onToggle(row)}
              aria-label={`Mark "${row.text}" ${row.done ? 'not done' : 'done'}`}
            />
          </div>
        );
      case 'task':
        return (
          <div
            data-col="task"
            className={dataCell(col, rule)}
            style={{ left: tasksGridFrozenLeft('task') }}
            data-frozen-edge
          >
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-role-data',
                row.done || row.archived ? 'text-text-soft line-through' : 'text-text-default',
              )}
            >
              {row.text}
            </span>
          </div>
        );
      // Lifecycle STATE: dot · chip, resolved through `work-status-display` —
      // never a cell-local tone map. Deleted outranks done: an archived row's
      // check state is history, but what you need to read first is that it is
      // not on the list any more.
      case 'status': {
        const workStatus = row.archived ? 'CANCELED' : row.done ? 'DONE' : 'OPEN';
        return (
          <div data-col="status" className={dataCell(col, rule)}>
            <GridStatusCellValue
              label={row.archived ? 'Deleted' : workStatusLabel(workStatus)}
              toneClass={workStatusChipClass(workStatus)}
              dotClass={workStatusDot(workStatus)}
              tooltip={
                row.archived
                  ? 'Deleted — restore it from the inspector'
                  : row.done
                    ? 'Checked off'
                    : 'Not checked off'
              }
            />
          </div>
        );
      }
      case 'kind':
        return (
          <div data-col="kind" className={dataCell(col, rule)}>
            <span className="truncate text-role-caption text-text-muted">
              {row.kind === 'recurring' ? 'Recurring' : 'To-do'}
            </span>
          </div>
        );
      case 'station':
        return (
          <div data-col="station" className={dataCell(col, rule)}>
            {row.station ? (
              <span className="truncate text-role-caption text-text-muted">
                {STATION_LABEL[row.station as StationKey] ?? row.station}
              </span>
            ) : (
              <GridCellDash />
            )}
          </div>
        );
      case 'due':
        return (
          <div data-col="due" className={dataCell(col, rule)}>
            {row.resetsAtMs != null ? (
              <GridDateTimeCellValue
                raw={new Date(row.resetsAtMs).toISOString()}
                className="text-role-caption"
              />
            ) : (
              <GridCellDash />
            )}
          </div>
        );
      case 'updated':
        return (
          <div data-col="updated" className={dataCell(col, rule)}>
            {row.checkedAtMs != null ? (
              <GridDateTimeCellValue
                raw={new Date(row.checkedAtMs).toISOString()}
                className="text-role-caption"
              />
            ) : (
              <GridCellDash />
            )}
          </div>
        );
      case '_fill':
        return <div data-col="_fill" role="presentation" aria-hidden className={dataCell(col, false)} />;
      default:
        return <span className={dataCell(col, rule)} />;
    }
  };

  return (
    <div
      data-staff-task-id={row.id}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`Task ${row.text}`}
      onClick={() => onSelect(row)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(row);
        }
      }}
      className={cn(
        tasksGridRowShellClass(isMobile),
        'cursor-pointer border-b border-border-hairline hover:bg-surface-hover',
        selected && 'bg-surface-accent',
      )}
      style={isMobile ? undefined : { gridTemplateColumns: tasksGridTemplate(columns) }}
    >
      {columns.map((col, i) => (
        <div key={col.key} className="contents">
          {renderCell(col, i === columns.length - 1)}
        </div>
      ))}
    </div>
  );
}
