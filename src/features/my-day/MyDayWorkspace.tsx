'use client';

/**
 * My Day — Home Today's Workbench, composed from the house shells.
 *
 *   chrome    → `WorkbenchChromeHeader` `density="band"` (the Unbox / Triage /
 *               History face) — lane tabs left, collapsed search, queue links in
 *               `right`, Fields in the `trailing` cluster
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
 * **The queue counts are chrome, not a rollup.** They were the column's only
 * other content, and they briefly became a `KpiStrip` — but a KPI hero claims
 * "this is a metric worth reading", and these are just doors to other pages with
 * a number on them. They ride the chrome's `right` slot (where a workbench keeps
 * its refine/scope controls), which also keeps the body a single region: chrome,
 * then table.
 *
 * One sticky layer per scroll port: the chrome renders OUTSIDE the body, the
 * grid owns its own scroll (`display/workbench.md` → Sticky docking).
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  WORKBENCH_BODY_COLUMN,
  WORKBENCH_CHROME_COLUMN,
  WorkbenchChromeHeader,
  withScopeDivider,
} from '@/components/dashboard/workbench-shell';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { ToolbarSearchToggle } from '@/design-system/primitives/ToolbarSearchToggle';
import { useDebounce } from '@/hooks';
import type { MyDayQueueCard } from '@/lib/my-day/my-day-types';
import { MyDayKpiStrip } from './MyDayKpiStrip';
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

/**
 * Queue doors for the chrome's `right` slot — label + count, one line, no card.
 *
 * Quiet on purpose: these leave the surface, so they must not out-rank the lane
 * tabs that scope it. `text-role-caption` label + `text-role-micro` count is the
 * house one-row anatomy at chrome scale, and the 8px hit-box matches the band's
 * `h-8` right cluster.
 */
function MyDayQueueLinks({ cards }: { cards: readonly MyDayQueueCard[] }) {
  if (cards.length === 0) return null;
  return (
    <div className="flex min-w-0 items-center gap-0.5">
      {cards.map((card) => (
        <HoverTooltip key={card.key} label={`Open ${card.label}`} focusable={false} asChild>
          <Link
            href={card.href}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-default"
          >
            <span className="truncate text-role-caption font-medium">{card.label}</span>
            <span className="text-role-micro tabular-nums text-text-soft">{card.count}</span>
          </Link>
        </HoverTooltip>
      ))}
    </div>
  );
}

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
  // The KPI band's denominator: everything the OTHER controls have already left
  // on screen. Counting the whole day instead would let a tile read 5 and then
  // produce 2 rows once the lane and the query applied — a faceted count has to
  // promise what clicking it delivers.
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

  const queueCards = data?.queueCards ?? [];

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
          // Query/refine controls stay in `right`. The queue links live here
          // rather than moving to `trailing` because `trailing` is the DISPLAY
          // cluster (how this list is drawn) and a queue link is neither —
          // it leaves the surface entirely. They keep the slot the F0 rebuild
          // gave them.
          right={<MyDayQueueLinks cards={queueCards} />}
          // Sort → Fields → Import → Add, with honest absence: Today renders
          // only Fields.
          //  · Sort — absent. Today's ordering IS the column sort (`?colsort=`),
          //    which the grid header already owns; a `QueueSortSwitch` here
          //    would be a second sort vocabulary over one list, and
          //    `source-of-truth.md` → Grid column sort allows exactly one param
          //    per surface.
          //  · Import / Add — absent. Nothing creates a Today task: rows are a
          //    projection of work assignments and interrupts owned elsewhere.
        />
      </div>

      <div className={`min-h-0 flex-1 ${WORKBENCH_BODY_COLUMN}`}>
        <MyDayOnboardingPanel />

        {/*
          KPI lives in the BODY, never in the chrome — the chrome is a single
          non-scrolling sticky layer and a second band inside it would be the
          stacked-sticky bug `display/workbench.md` names. It does not scroll
          away in practice because the grid is a bounded host that owns its own
          Y scroll; that is deliberate, not a bug to fix.
        */}
        {!isError ? (
          <MyDayKpiStrip
            counts={horizonCounts}
            loading={isLoading}
            active={horizon}
            onToggle={toggleHorizon}
          />
        ) : null}

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
