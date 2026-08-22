'use client';

/**
 * One My Tasks row — the shared compound row, in the Tasks family's stance.
 *
 * This file used to hand-roll seven cells and its own row shell: a bare `<div>`
 * with a local `cursor-pointer border-b hover:bg-surface-hover` and a
 * `bg-surface-accent` selection wash. That is the same job
 * {@link LedgerGridLeafRow} + `ledgerRowFillClass` already do for Unbox,
 * Incoming and To-Ship, so Tasks had its OWN answer to "what does a selected
 * row look like" — a different wash, no triage flag support, and no shared
 * scroll-min width var. Selection now paints from the one place it paints
 * everywhere else.
 *
 * The five compound tracks come from {@link renderCompoundGridCell}. What stays
 * here is the one thing that is genuinely this surface's:
 *
 * **The gutter checkbox is the PRIMARY VERB, not a selection.** Ticking it
 * checks the task off; clicking anywhere else opens the record in the right
 * rail. One row, two gestures — which is why the checkbox cell stops
 * propagation. The compound model governs that track's geometry; it has never
 * governed what clicking it does.
 */

import type { ReactNode } from 'react';
import { renderCompoundGridCell } from '@/components/tables/compound/CompoundGridCell';
import { gridDataCellClass, LedgerGridLeafRow } from '@/design-system/components/grid';
import {
  TASKS_COMPOUND_COLUMNS,
  tasksGridTemplate,
  type TasksGridColumn,
} from '@/lib/staff-todos/tasks-grid-layout';
import { TASKS_GRID_CAPABILITIES } from './tasks-grid-descriptor';
import { staffTaskCompoundView } from './staff-task-compound-view';
import type { StaffTaskRow } from './staff-task-row';

export function TasksGridRow({
  row,
  columns = TASKS_COMPOUND_COLUMNS,
  nowMs,
  isMobile = false,
  selected,
  togglePending,
  onToggle,
  onSelect,
}: {
  row: StaffTaskRow;
  columns?: readonly TasksGridColumn[];
  /** The SAME clock every row on this table read — never `Date.now()` here. */
  nowMs: number;
  isMobile?: boolean;
  selected: boolean;
  togglePending: boolean;
  onToggle: (row: StaffTaskRow) => void;
  onSelect: (row: StaffTaskRow) => void;
}) {
  const view = staffTaskCompoundView(row, { nowMs });

  const renderCell = (col: TasksGridColumn, last: boolean): ReactNode => {
    const rule = !last;

    const compoundCell = renderCompoundGridCell({
      col,
      columns,
      rule,
      view,
      // No `onCommitNote`: `staff_todos` has no note column, so the second
      // line is the station and it is read-only. Capability, not mode.
      onOpen: () => onSelect(row),
      // The gutter's MEANING here is "check this task off", not "select this
      // row" — same control, same picture, a different handler. It reads
      // `row.done`, never the table-selection scope, which is also why the
      // descriptor declares `multiSelect: false` and the header stays inert.
      select: {
        checked: row.done,
        onToggle: () => onToggle(row),
        disabled: row.archived || togglePending,
        label: `Mark "${row.text}" ${row.done ? 'not done' : 'done'}`,
      },
    });
    if (compoundCell) return compoundCell;

    switch (col.key) {
      case '_fill':
        return (
          <div
            data-col="_fill"
            role="presentation"
            aria-hidden
            className={gridDataCellClass(col, { rule: false, inset: 'grid' })}
          />
        );
      default:
        return <span className={gridDataCellClass(col, { rule, inset: 'grid' })} />;
    }
  };

  return (
    <LedgerGridLeafRow
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
      className="group/row cursor-pointer"
      columns={columns}
      template={tasksGridTemplate(columns)}
      selected={selected}
      capabilities={TASKS_GRID_CAPABILITIES}
      isMobile={isMobile}
      renderCell={(col, { last }) => renderCell(col, last)}
    />
  );
}
