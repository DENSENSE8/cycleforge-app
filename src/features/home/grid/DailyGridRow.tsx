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
import { formatDateTimePST } from '@/utils/date';
import {
  DAILY_GRID_COLUMNS,
  DAILY_GRID_FROZEN_CELL,
  dailyGridFrozenLeft,
  dailyGridRowShellClass,
  dailyGridTemplate,
  type DailyGridColumn,
} from '@/lib/daily-checks/daily-grid-layout';
import type { DailyTaskRow } from './daily-task-row';
import { cn } from '@/utils/_cn';

/**
 * One Daily task row.
 *
 * The gutter checkbox is the surface's PRIMARY VERB, not a selection — ticking
 * it marks the task done for the viewer. That is why the capability bag
 * declares `multiSelect: false`: mounting select-all wiring over this control
 * would give one box two meanings.
 */
export function DailyGridRow({
  row,
  columns = DAILY_GRID_COLUMNS,
  isMobile = false,
  selected,
  canToggle,
  togglePending,
  onToggle,
  onSelect,
}: {
  row: DailyTaskRow;
  columns?: readonly DailyGridColumn[];
  isMobile?: boolean;
  selected: boolean;
  canToggle: boolean;
  togglePending: boolean;
  onToggle: (row: DailyTaskRow) => void;
  onSelect: (row: DailyTaskRow) => void;
}) {
  const dataCell = (col: DailyGridColumn, rule = true) =>
    gridDataCellClass(col, { rule, inset: 'grid', frozenClass: DAILY_GRID_FROZEN_CELL });

  const renderCell = (col: DailyGridColumn, last: boolean): ReactNode => {
    const rule = !last;
    switch (col.key) {
      case 'select':
        return (
          <div
            className={cn(dataCell(col, true), 'justify-center')}
            style={{ left: dailyGridFrozenLeft('select') }}
            // The verb lives here, so the click must not also open the record.
            onClick={(e) => e.stopPropagation()}
          >
            <Checkbox
              checked={row.done}
              disabled={!canToggle || togglePending}
              onCheckedChange={() => onToggle(row)}
              aria-label={`Mark "${row.title}" ${row.done ? 'not done' : 'done'}`}
            />
          </div>
        );
      case 'task':
        return (
          <div
            data-col="task"
            className={dataCell(col, rule)}
            style={{ left: dailyGridFrozenLeft('task') }}
            data-frozen-edge
          >
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-role-data',
                // Struck-through is the checklist's own idiom for a finished
                // line; the Status track still says it in words for anyone who
                // cannot read the strike.
                row.done ? 'text-text-soft line-through' : 'text-text-default',
              )}
            >
              {row.title}
            </span>
          </div>
        );
      // The row's lifecycle STATE: dot · chip. Same shape as Unbox History's
      // status track, and for the same reason — bare text in a ruled band reads
      // as another data value rather than as a state.
      //
      // Label, fill/ink and dot all resolve through `work-status-display`,
      // never a cell-local map. This cell briefly carried its own
      // `bg-emerald-50 …` strings, which were a character-for-character copy of
      // that SoT's `DONE` entry — a second declaration that would drift the
      // first time the house tone moved.
      case 'status': {
        const workStatus = row.done ? 'DONE' : 'OPEN';
        return (
          <div data-col="status" className={dataCell(col, rule)}>
            <GridStatusCellValue
              label={workStatusLabel(workStatus)}
              toneClass={workStatusChipClass(workStatus)}
              dotClass={workStatusDot(workStatus)}
              tooltip={
                row.done
                  ? row.markedAt
                    ? `You checked this off ${formatDateTimePST(row.markedAt)}`
                    : 'You checked this off today'
                  : 'Not checked off yet today'
              }
            />
          </div>
        );
      }
      case 'team':
        return (
          <div data-col="team" className={dataCell(col, rule)}>
            {row.teamTotal > 0 ? (
              <span
                className={cn(
                  'text-role-data tabular-nums',
                  row.teamDone === row.teamTotal ? 'text-emerald-700' : 'text-text-muted',
                )}
              >
                {row.teamDone}/{row.teamTotal}
              </span>
            ) : (
              <GridCellDash />
            )}
          </div>
        );
      case 'marked':
        return (
          <div data-col="marked" className={dataCell(col, rule)}>
            {row.markedAt ? (
              <GridDateTimeCellValue raw={row.markedAt} className="text-role-caption" />
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
      data-daily-task-id={row.id}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`Task ${row.title}`}
      onClick={() => onSelect(row)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(row);
        }
      }}
      className={cn(
        dailyGridRowShellClass(isMobile),
        'cursor-pointer border-b border-border-hairline hover:bg-surface-hover',
        selected && 'bg-surface-accent',
      )}
      style={isMobile ? undefined : { gridTemplateColumns: dailyGridTemplate(columns) }}
    >
      {columns.map((col, i) => (
        <div key={col.key} className="contents">
          {renderCell(col, i === columns.length - 1)}
        </div>
      ))}
    </div>
  );
}
