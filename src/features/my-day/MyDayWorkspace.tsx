'use client';

/**
 * My Day — Home Today's Workbench, composed from the house shells.
 *
 *   chrome    → `WorkbenchChromeHeader` `density="band"` (the Unbox / Triage /
 *               History face) — lane tabs left, collapsed search, the due-horizon
 *               refine in `right`, Fields in the `trailing` cluster
 *   collection→ `LedgerGridSurface` + `GridSurfaceDescriptor` via `MyDayGridView`
 *   record    → `RightRailHost` (non-modal) via `MyDayTaskInspectorRail`
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

import { useEffect, useMemo, useState } from 'react';
import {
  WORKBENCH_BODY_COLUMN,
  WORKBENCH_CHROME_COLUMN,
  WorkbenchChromeHeader,
  withScopeDivider,
} from '@/components/dashboard/workbench-shell';
import { ToolbarSearchToggle } from '@/design-system/primitives/ToolbarSearchToggle';
import { useDebounce } from '@/hooks';
import { MyDayDueHorizonChips } from './MyDayDueHorizonChips';
import { MyDayOnboardingPanel } from './MyDayOnboardingPanel';
import { MyDayTaskInspectorRail } from './MyDayTaskInspector';
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
  const { lane, taskId, query, horizon, setLane, setTaskId, setQuery, toggleHorizon } =
    useMyDayView();

  // The field is a local draft debounced into `?q=` — typing must not push a
  // history entry per keystroke, and the URL stays the durable answer so a
  // shared link (and a saved view) reproduces the refinement.
  const [draft, setDraft] = useState(query);
  useEffect(() => setDraft(query), [query]);
  const debouncedDraft = useDebounce(draft, 250);
  useEffect(() => {
    if (debouncedDraft.trim() === query.trim()) return;
    setQuery(debouncedDraft.trim());
  }, [debouncedDraft, query, setQuery]);

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
  // Same strip grammar as Unbox: the leading SCOPE tab (here "Everything", the
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
      <div className={WORKBENCH_CHROME_COLUMN}>
        <WorkbenchChromeHeader
          density="band"
          tabs={tabs}
          activeTab={lane}
          onTabChange={(id) => setLane(id as MyDayLaneFilter)}
          solidTone="accent"
          // Collapsed at rest. Today's search REFINES the list already on
          // screen, so it is not one of the two always-open entry-path
          // exceptions (`/ops/photos`, `/search`) — `ui-design-system.md` →
          // Scoped search chrome.
          search={
            <ToolbarSearchToggle
              value={draft}
              onChange={setDraft}
              onClear={() => {
                setDraft('');
                setQuery('');
              }}
              placeholder="Filter tasks…"
              tone="blue"
            />
          }
          // `right` is the REFINE cluster — controls that narrow the rows below
          // (`display/workbench-ops-queue.md` → Trailing Display & Actions:
          // "Filters / refine stay in `right`; query ≠ display"). The due
          // horizon is exactly that, so it lands here rather than in `trailing`,
          // which is the DISPLAY cluster (how this list is drawn, not which
          // rows it holds).
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
          // No `trailing` cluster at all — honest absence of every slot it
          // holds (`WorkbenchTrailingCluster` would render null anyway):
          //  · Sort — Today's ordering IS the column sort (`?colsort=`), which
          //    the grid header already owns; a `QueueSortSwitch` here would be
          //    a second sort vocabulary over one list, and `source-of-truth.md`
          //    → Grid column sort allows exactly one param per surface.
          //  · Import / Add — nothing creates a Today task: rows are a
          //    projection of work assignments and interrupts owned elsewhere.
          //  · Column display — never chrome. It is the grid's own top-right
          //    header lip (`MyDayGridView` → `onOpenColumnDetails`), which is
          //    where the retired `fields` slot went 2026-08-02.
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
      <div className={`min-h-0 flex-1 ${WORKBENCH_BODY_COLUMN}`}>
        <MyDayOnboardingPanel />

        {isError ? (
          <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-6 text-center">
            <p className="text-role-caption font-semibold text-rose-700">
              Could not load My Day. Try refreshing.
            </p>
          </div>
        ) : (
          <MyDayGridView
            tasks={visibleTasks}
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
                  : `Nothing in ${myDayLaneLabel(lane)} right now — try Everything.`
            }
            isFiltered={isFiltered}
            selectedTaskId={taskId}
            onSelectTask={(task) => setTaskId(task.id)}
          />
        )}
      </div>

      <MyDayTaskInspectorRail task={selectedTask} onClose={() => setTaskId(null)} />
    </div>
  );
}
