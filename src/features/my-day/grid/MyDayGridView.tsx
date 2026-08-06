'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { LedgerGridSurface } from '@/design-system/components/grid';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import type { RowGroup } from '@/lib/group-rows';
import type { MyDayTask } from '@/lib/my-day/my-day-tasks';
import {
  MY_DAY_GRID_COLUMNS,
  MY_DAY_TABLE_ID,
  defaultDirForMyDayGridSort,
  isMyDayGridSortable,
  type MyDayGridColumn,
  type MyDayGridColumnKey,
} from '@/lib/my-day/my-day-grid-layout';
import { makeMyDayGridDescriptor } from './my-day-grid-descriptor';
import { MyDayGridColumnHeader } from './MyDayGridColumnHeader';
import { MyDayGridRow } from './MyDayGridRow';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

interface MyDayGridViewProps {
  tasks: MyDayTask[];
  loading: boolean;
  /** Settled with no tasks at all — say what that MEANS, not that the list is empty. */
  emptyMessage: string;
  /** Settled with none in the picked lane — a different answer (widen the scope). */
  searchEmptyMessage?: string;
  isFiltered?: boolean;
  selectedTaskId: string | null;
  onSelectTask: (task: MyDayTask) => void;
  /** FULL canonical column list — `LedgerGridSurface` resolves visibility. */
  columns?: readonly MyDayGridColumn[];
  /**
   * Portal target for the column-display (▦) trigger — when set, the gutter
   * trigger renders into this element (the triage-band controls slot) instead
   * of floating over the card corner. Matches `OrdersGridView`.
   */
  columnTriggerPortalTarget?: HTMLElement | null;
}

function compareMyDayTasks(
  a: MyDayTask,
  b: MyDayTask,
  key: MyDayGridColumnKey,
  dir: GridSortDir,
): number {
  const sign = dir === 'asc' ? 1 : -1;
  switch (key) {
    case 'task':
      return sign * a.title.localeCompare(b.title);
    case 'lane':
      return sign * a.lane.localeCompare(b.lane);
    case 'queue':
      return sign * a.queueLabel.localeCompare(b.queueLabel);
    case 'record':
      return sign * (a.recordLabel || '').localeCompare(b.recordLabel || '');
    case 'due':
      // Absent deadlines sort last in BOTH directions — a task with no due date
      // is not "the most urgent thing today", which is what an empty-string
      // compare would claim under `desc`.
      if (!a.deadlineAt && !b.deadlineAt) return 0;
      if (!a.deadlineAt) return 1;
      if (!b.deadlineAt) return -1;
      return sign * a.deadlineAt.localeCompare(b.deadlineAt);
    case 'status':
      return sign * (a.status || '').localeCompare(b.status || '');
    default:
      return 0;
  }
}

/**
 * Today's task spreadsheet — the Workbench collection map, composed from
 * {@link LedgerGridSurface} exactly like the Pickup / Incoming / Receiving
 * adapters (`surface="sheet"` — Unbox flush plane). This surface owns only what
 * is genuinely Today-specific: the row comparator and the empty copy. The shell,
 * skeleton, sticky header, airtable rules and virtualization all come from the SoT.
 *
 * Row order defaults to the feed's own ranking (do next → assigned →
 * attention); a column sort replaces it and is URL-durable via
 * `?colsort=`/`?coldir=`, which `/` already carries.
 */
export function MyDayGridView({
  tasks,
  loading,
  emptyMessage,
  searchEmptyMessage,
  isFiltered,
  selectedTaskId,
  onSelectTask,
  columns = MY_DAY_GRID_COLUMNS,
  columnTriggerPortalTarget = null,
}: MyDayGridViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    sort: columnSort,
    dir: sortDir,
    setSort,
  } = useUrlColumnSort<MyDayGridColumnKey>({
    isColumn: isMyDayGridSortable,
    defaultDir: defaultDirForMyDayGridSort,
  });

  // One-shot settle tick after the first data arrives — the virtualized grid
  // mounts its scrollport in the same commit as the rows, and nothing else
  // re-renders this subtree, so without it the body can paint blank until the
  // first interaction. Same fix as `PickupGridView`.
  const [, settleTick] = useState(0);
  const hasRows = tasks.length > 0;
  useEffect(() => {
    if (loading || !hasRows) return;
    const raf = requestAnimationFrame(() => settleTick((t) => t + 1));
    return () => cancelAnimationFrame(raf);
  }, [loading, hasRows]);

  // Today is a flat list — no one-to-many fold and no day bands (it is one civil
  // day by definition), so the surface takes a single unbanded group.
  const orderGroupsByDate = useMemo(() => {
    const ordered =
      columnSort && sortDir
        ? [...tasks].sort((a, b) => compareMyDayTasks(a, b, columnSort, sortDir))
        : tasks;
    const groups: RowGroup<MyDayTask>[] = ordered.map((task) => ({
      key: `task:${task.id}`,
      rows: [task],
    }));
    return [['', groups]] as [string, RowGroup<MyDayTask>[]][];
  }, [tasks, columnSort, sortDir]);

  return (
    <LedgerGridSurface<MyDayTask, MyDayGridColumnKey, MyDayGridColumn>
      ariaLabel="My Day tasks"
      columns={columns}
      makeDescriptor={makeMyDayGridDescriptor}
      orderGroupsByDate={orderGroupsByDate}
      rows={tasks}
      getRowId={(t) => t.id}
      sort={columnSort}
      dir={sortDir}
      onSortChange={setSort}
      loading={loading}
      emptyMessage={emptyMessage}
      searchEmptyMessage={searchEmptyMessage}
      isSearching={isFiltered}
      scrollRef={scrollRef}
      testId="my-day-grid-body"
      // `my-day` is the Fields-menu vocabulary (`TABLE_COLUMNS`) and the
      // per-staff prefs bucket. It is deliberately its own bucket, not shared
      // with another grid: a Fields toggle on Today must not silently hide a
      // track on a surface that happens to use the same column key.
      tableId={MY_DAY_TABLE_ID}
      surface="sheet"
      columnTriggerPortalTarget={columnTriggerPortalTarget}
      renderColumnHeader={({ toggleColumnSort, onResizeColumn, onResetColumn, columns: visible }) => (
        <MyDayGridColumnHeader
          columns={visible}
          activeSort={columnSort}
          sortDir={sortDir}
          onSortColumn={toggleColumnSort}
          onResizeColumn={onResizeColumn}
        onResetColumn={onResetColumn}
        />
      )}
      renderGroup={(group, _stripe, { columns: visible }) => (
        <MyDayGridRow
          key={group.rows[0].id}
          task={group.rows[0]}
          isSelected={group.rows[0].id === selectedTaskId}
          onSelect={onSelectTask}
          columns={visible}
        />
      )}
      renderRow={(task, _stripe, { columns: visible }) => (
        <MyDayGridRow
          task={task}
          isSelected={task.id === selectedTaskId}
          onSelect={onSelectTask}
          columns={visible}
        />
      )}
    />
  );
}
