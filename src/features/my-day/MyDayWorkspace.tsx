'use client';

/**
 * My Day — Home Today's Workbench, composed from the house shells.
 *
 *   chrome    → `WorkbenchChromeHeader` `density="band"` on `WORKBENCH_SHEET_CHROME`
 *               (Unbox flush — no side gutters) — lane tabs left, TechRailSearchBar,
 *               due-horizon refine in `right`, Add (watch ticket) in `trailing`
 *   collection→ `LedgerGridSurface` `surface="sheet"` via `MyDayGridView`
 *   record    → `RightRailHost` (non-modal) via `MyDayTaskInspectorRail`
 *               or `MyDayWatchRail` (`?watch=1` — ticket / tracking intake)
 *   rail      → `HomeContextPanel` (saved views), via the `home` route key
 *   feed      → `useMyDayFeed`, still the one client of `GET /api/my-day`
 *
 * **No lane sidebar.** The lanes were a resident 280px column whose entire job
 * was a four-way filter over the table beside it — a facet that belongs in the
 * table's own chrome, where every other workbench puts it
 * (`WorkbenchChromeHeader` tabs: Unbox's Queue/Viewed/History, History's
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

import { useMemo, useState } from 'react';
import {
  WORKBENCH_SHEET_CHROME,
  WORKBENCH_SHEET_HOST,
  WorkbenchChromeHeader,
  WorkbenchTrailingCluster,
  WorkbenchTriageBand,
  withScopeDivider,
} from '@/components/dashboard/workbench-shell';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import { cn } from '@/utils/_cn';
import { MyDayDueHorizonChips } from './MyDayDueHorizonChips';
import { MyDayOnboardingPanel } from './MyDayOnboardingPanel';
import { MyDayTaskInspectorRail } from './MyDayTaskInspector';
import { MyDayWatchRail } from './MyDayWatchRail';
import { MyDayWatchTicketAction } from './MyDayWatchTicketAction';
import { MyDayGridView } from './grid/MyDayGridView';
import { useMyDayFeed } from './useMyDayFeed';
import { useMyDayView } from './useMyDayView';
import {
  MY_DAY_LANE_FILTERS,
  filterMyDayTasks,
  filterMyDayTasksByHorizon,
  myDayDueHorizonCounts,
  myDayDueHorizonLabel,
  myDayLaneCounts,
  myDayLaneLabel,
  myDayLaneTabColor,
  myDayTasksFromFeed,
  searchMyDayTasks,
  type MyDayLaneFilter,
} from '@/lib/my-day/my-day-tasks';

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

  const [controlsEl, setControlsEl] = useState<HTMLDivElement | null>(null);

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

  const isFiltered = lane !== 'all' || query.trim().length > 0 || horizon !== null;

  // All first, then the specific lanes — the tab strip IS the filter, so the
  // unfiltered view has to be a tab rather than an implied empty state.
  // Same strip grammar as Unbox: the leading SCOPE tab (here "All", the
  // unfiltered view) is separated from the lanes that filter within it by one
  // hairline — `withScopeDivider` owns that placement for both surfaces.
  const tabs = useMemo(
    () =>
      withScopeDivider(
        MY_DAY_LANE_FILTERS.map((id) => ({
          id,
          label: myDayLaneLabel(id),
          count: counts[id],
          color: myDayLaneTabColor(id),
        })),
      ),
    [counts],
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-canvas text-text-default">
      <div className={cn(WORKBENCH_SHEET_CHROME, 'flex flex-col gap-0')}>
        <WorkbenchChromeHeader
          density="band"
          className="rounded-none border-l-0 border-t-0 shadow-sm"
          tabs={tabs}
          activeTab={lane}
          onTabChange={(id) => setLane(id as MyDayLaneFilter)}
          solidTone="accent"
          // Trailing = solid Add CTA (opens Watch rail — ticket or tracking).
          // Sort stays on the grid header (`?colsort=`); column display stays on
          // the grid lip — neither belongs in this cluster.
          trailing={
            <WorkbenchTrailingCluster
              actions={<MyDayWatchTicketAction onOpen={openWatch} />}
            />
          }
        />
        {/*
          Band 3 — data-table triage: find LEFT (always-open TechRailSearchBar —
          filter+paste, not icon-first expand), refine RIGHT (the due-horizon
          chips narrow the rows below — `display/workbench-ops-queue.md` →
          "Filters / refine stay in `right`; query ≠ display"). Search + refine
          live here, off Band 1, per the five-row Sheets SoT.
        */}
        <WorkbenchTriageBand
          search={
            <TechRailSearchBar
              variant="chrome"
              value={query}
              onChange={(v) => setQuery(v.trim())}
              placeholder="Filter tasks…"
              className="w-40 shrink-0 lg:w-56"
            />
          }
          right={
            !isError ? (
              <MyDayDueHorizonChips
                counts={horizonCounts}
                loading={isLoading}
                active={horizon}
                onToggle={toggleHorizon}
              />
            ) : null
          }
          controlsSlotRef={setControlsEl}
        />
      </div>

      {/*
        The body is onboarding + the table. The due-horizon refine used to sit
        here as a KPI band; moving it into the chrome's `right` slot did NOT
        create the stacked-sticky bug `display/workbench.md` names, because it
        joined the SINGLE existing chrome band rather than adding a second one —
        the chrome is still one non-scrolling layer outside the scroll port, and
        the grid still owns the only sticky layer inside it.
      */}
      <div className={cn(WORKBENCH_SHEET_HOST, 'min-h-0')}>
        <MyDayOnboardingPanel />

        {isError ? (
          <div className="mx-4 my-6 rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-6 text-center">
            <p className="text-role-caption font-semibold text-rose-700">
              Could not load My Day. Try refreshing.
            </p>
          </div>
        ) : (
          <MyDayGridView
            tasks={visibleTasks}
            columnTriggerPortalTarget={controlsEl}
            loading={isLoading}
            // Settled-with-nothing on a "what needs me" queue is an ALL-CLEAR,
            // not an absence — say so rather than showing a create prompt.
            emptyMessage="Nothing needs you right now."
            // No-match is a THIRD answer, and it names the control that would
            // widen it — narrowest first, because that is the one the operator
            // most recently touched: KPI tile → query → lane.
            searchEmptyMessage={
              horizon
                ? `Nothing ${myDayDueHorizonLabel(horizon).toLowerCase()} here — click the tile again to clear it.`
                : query.trim()
                  ? `No tasks match “${query.trim()}”. Clear the filter to see the rest.`
                  : `Nothing in ${myDayLaneLabel(lane)} right now — try All.`
            }
            isFiltered={isFiltered}
            selectedTaskId={taskId}
            onSelectTask={(task) => setTaskId(task.id)}
          />
        )}
      </div>

      <MyDayTaskInspectorRail task={selectedTask} onClose={() => setTaskId(null)} />
      <MyDayWatchRail open={watchOpen} onClose={closeWatch} />
    </div>
  );
}
