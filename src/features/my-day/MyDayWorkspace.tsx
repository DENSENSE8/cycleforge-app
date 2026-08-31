'use client';

/**
 * My Day — Home Today's Workbench, composed from the house shells.
 *
 *   chrome    → none. `DataTable` draws the find field, the due-horizon filter
 *               and the lane tabs from the data this workspace resolves.
 *   collection→ `LedgerGridSurface` `surface="sheet"` (mounted via NonlinearTableHost)
 *   record    → `RightRailHost` (non-modal) via `MyDayTaskInspectorRail`
 *               or `MyDayWatchRail` (`?watch=1` — ticket / tracking intake)
 *   rail      → `HomeContextPanel` (saved views), via the `home` route key
 *   feed      → `useMyDayFeed`, still the one client of `GET /api/my-day`
 *
 * **No lane sidebar.** The lanes were a resident 280px column whose entire job
 * was a four-way filter over the table beside it — a facet that belongs in the
 * table's own chrome, where every other workbench puts it
 * (the table's own tab strip: Unbox's Queue/Viewed/History, History's
 * All/Unfound). Deleting it gave the grid back ~280px, which is what the
 * Due/Status tracks needed. The rail Today has now holds SAVED VIEWS — operator-
 * defined combinations, which is the one thing chrome cannot own
 * (`display/workbench.md` → Tabs vs. saved views).
 *
 * **The body is the table, and nothing else (2026-08-01 chrome-altitude pass).**
 * Two things left this file:
 *  · The **KPI band** (`MyDayKpiStrip`, deleted) — a Monitor rollup region that
 *    cost the largest single block of vertical space above the grid to render
 *    three numbers whose only job was to narrow the table. It is now
 *    `MyDayDueHorizonChips` in the chrome's `right` slot: same `?filter=`, same
 *    toggle, at chrome scale instead of hero scale. That file's docblock carries
 *    the full reasoning, including why the horizons did NOT become tabs.
 *  · The **queue links** (`MyDayQueueLinks`, deleted) — label + count doors to
 *    other pages. A door is navigation, and the chrome band's one job is
 *    controlling the data mounted below it. They now live in the GlobalHeader
 *    Inbox popover (`InboxQueueLinks`), which is the app-wide "be told"
 *    channel — NOT the MasterNav spine, whose root shows sections rather than
 *    pages and whose registry is deliberately static. That file's docblock
 *    carries the ruling. `queueCards` still rides this feed, and the Inbox
 *    strip shares its `['my-day']` query key, so Today pays nothing for it.
 *
 * One sticky layer per scroll port: the chrome renders OUTSIDE the body, the
 * grid owns its own scroll (`display/workbench.md` → Sticky docking).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/utils/_cn';
import { MyDayOnboardingPanel } from './MyDayOnboardingPanel';
import { MyDayTaskInspectorRail } from './MyDayTaskInspector';
import { MyDayWatchRail } from './MyDayWatchRail';
import { DataTable } from '@/components/tables/DataTable';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import type { RowGroup } from '@/lib/group-rows';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import {
  defaultDirForMyDayGridSort,
  isMyDayGridSortable,
  type MyDayGridColumn,
  type MyDayGridColumnKey,
} from '@/lib/my-day/my-day-grid-layout';
import { MY_DAY_TABLE_BINDING } from './grid/my-day-table-definition';
import { MyDayGridRow } from './grid/MyDayGridRow';
import { useMyDayFeed } from './useMyDayFeed';
import { useMyDayView } from './useMyDayView';
import {
  MY_DAY_LANE_FILTERS,
  filterMyDayTasks,
  filterMyDayTasksByHorizon,
  myDayDueHorizonCounts,
  MY_DAY_DUE_HORIZONS,
  myDayDueHorizonLabel,
  type MyDayDueHorizon,
  myDayLaneCounts,
  myDayLaneLabel,
  myDayTasksFromFeed,
  searchMyDayTasks,
  type MyDayLaneFilter,
  type MyDayTask,
} from '@/lib/my-day/my-day-tasks';

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

export function MyDayWorkspace() {
  const { data, isLoading, isError } = useMyDayFeed();
  const {
    lane,
    taskId,
    query,
    horizon,
    watchOpen,
    setLane,
    setTaskId,
    setQuery,
    toggleHorizon,
    openWatch,
    closeWatch,
  } = useMyDayView();


  const tasks = useMemo(() => myDayTasksFromFeed(data), [data]);
  const counts = useMemo(() => myDayLaneCounts(tasks), [tasks]);
  // Lane first, then the text refinement — the tab counts stay the lane's own
  // totals rather than sliding under the operator as they type.
  const laneTasks = useMemo(() => filterMyDayTasks(tasks, lane), [tasks, lane]);
  // The horizon chips' denominator: everything the OTHER controls have already
  // left on screen. Counting the whole day instead would let a chip read 5 and
  // then produce 2 rows once the lane and the query applied — a faceted count
  // has to promise what clicking it delivers.
  const horizonBase = useMemo(() => searchMyDayTasks(laneTasks, query), [laneTasks, query]);
  const horizonCounts = useMemo(() => myDayDueHorizonCounts(horizonBase), [horizonBase]);
  const visibleTasks = useMemo(
    () => filterMyDayTasksByHorizon(horizonBase, horizon),
    [horizonBase, horizon],
  );

  // Resolve the selection against the VISIBLE rows: a row the lane or the query
  // excludes closes its inspector, and `?task=` survives in the URL so clearing
  // the filter brings it back (see `useMyDayView` → setQuery).
  const selectedTask = useMemo(
    () => (taskId ? visibleTasks.find((t) => t.id === taskId) ?? null : null),
    [visibleTasks, taskId],
  );


  // ONE filter control, both axes (operator ruling 2026-08-30 — selection
  // tabs are filters; the bottom strip is gone from this desk). Lanes lead
  // (WHOSE queue — mutually exclusive; picking the active lane clears back to
  // all), the due horizon follows (WHEN is it due — composes with the lane).
  const dueFilter = useMemo(
    () => ({
      options: [
        ...MY_DAY_LANE_FILTERS.filter((id) => id !== 'all').map((id) => ({
          id: `lane:${id}`,
          label: myDayLaneLabel(id),
          count: counts[id] || undefined,
          active: lane === id,
        })),
        ...MY_DAY_DUE_HORIZONS.map((id) => ({
          id,
          label: myDayDueHorizonLabel(id),
          count: horizonCounts[id] || undefined,
          active: horizon === id,
        })),
      ],
      onToggle: (id: string) => {
        if (id.startsWith('lane:')) {
          const next = id.slice('lane:'.length) as MyDayLaneFilter;
          setLane(next === lane ? 'all' : next);
          return;
        }
        toggleHorizon(id as MyDayDueHorizon);
      },
      onClearAll: () => {
        setLane('all');
        if (horizon) toggleHorizon(horizon);
      },
    }),
    [counts, lane, setLane, horizon, horizonCounts, toggleHorizon],
  );

  // Grid adapter (was `MyDayGridView`): the workspace mounts the registry host
  // directly. Today is a flat list — no fold, no day bands. Column sort is
  // URL-durable via `?colsort=`/`?coldir=`.
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const {
    sort: columnSort,
    dir: sortDir,
    setSort,
  } = useUrlColumnSort<MyDayGridColumnKey>({
    isColumn: isMyDayGridSortable,
    defaultDir: defaultDirForMyDayGridSort,
  });

  // One-shot settle tick after first data — the virtualized grid can otherwise
  // paint blank until the first interaction when nothing else re-renders.
  const [, settleTick] = useState(0);
  const hasGridRows = visibleTasks.length > 0;
  useEffect(() => {
    if (isLoading || !hasGridRows) return;
    const raf = requestAnimationFrame(() => settleTick((t) => t + 1));
    return () => cancelAnimationFrame(raf);
  }, [isLoading, hasGridRows]);

  const orderGroupsByDate = useMemo(() => {
    const ordered =
      columnSort && sortDir
        ? [...visibleTasks].sort((a, b) => compareMyDayTasks(a, b, columnSort, sortDir))
        : visibleTasks;
    const groups: RowGroup<MyDayTask>[] = ordered.map((task) => ({
      key: `task:${task.id}`,
      rows: [task],
    }));
    return [['', groups]] as [string, RowGroup<MyDayTask>[]][];
  }, [visibleTasks, columnSort, sortDir]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-canvas text-text-default">
      {/*
        The body is onboarding + the table. The due-horizon refine used to sit
        here as a KPI band; moving it into the chrome's `right` slot did NOT
        create the stacked-sticky bug `display/workbench.md` names, because it
        joined the SINGLE existing chrome band rather than adding a second one —
        the chrome is still one non-scrolling layer outside the scroll port, and
        the grid still owns the only sticky layer inside it.
      */}
      <div className={cn('relative flex min-h-0 min-w-0 flex-1 flex-col', 'min-h-0')}>
        <MyDayOnboardingPanel />

        {isError ? (
          <div className="mx-4 my-6 rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-6 text-center">
            <p className="text-role-caption font-semibold text-rose-700">
              Could not load My Day. Try refreshing.
            </p>
          </div>
        ) : (
          <DataTable<MyDayTask, MyDayGridColumnKey, MyDayGridColumn>
            binding={MY_DAY_TABLE_BINDING}
            orderGroupsByDate={orderGroupsByDate}
            rows={visibleTasks}
            getRowId={(t) => t.id}
            sort={columnSort}
            dir={sortDir}
            onSortChange={setSort}
            loading={isLoading}
            search={{ value: query, onChange: setQuery, placeholder: 'Filter tasks…' }}
            filter={dueFilter}
            emptyMessage="Nothing needs you right now."
            searchEmptyMessage={
              horizon
                ? `Nothing ${myDayDueHorizonLabel(horizon).toLowerCase()} here — click the tile again to clear it.`
                : query.trim()
                  ? `No tasks match “${query.trim()}”. Clear the filter to see the rest.`
                  : `Nothing in ${myDayLaneLabel(lane)} right now — try All.`
            }
            scrollRef={gridScrollRef}
            renderGroup={(group, _stripe, { columns: visible }) => (
              <MyDayGridRow
                key={group.rows[0].id}
                task={group.rows[0]}
                isSelected={group.rows[0].id === taskId}
                onSelect={(task) => setTaskId(task.id)}
                columns={visible}
              />
            )}
            renderRow={(task, _stripe, { columns: visible }) => (
              <MyDayGridRow
                task={task}
                isSelected={task.id === taskId}
                onSelect={(t) => setTaskId(t.id)}
                columns={visible}
              />
            )}
          />
        )}
      </div>

      <MyDayTaskInspectorRail task={selectedTask} onClose={() => setTaskId(null)} />
      <MyDayWatchRail open={watchOpen} onClose={closeWatch} />
    </div>
  );
}
