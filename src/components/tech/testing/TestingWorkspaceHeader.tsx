'use client';

/**
 * Testing workspace chrome — Sheets flush stack (Unbox / To-ship recipe):
 *
 *   Band 1 — tabs (Urgent · Returns · Pending · All · History)
 *   Band 2 — KPI (`WorkbenchKpiBand` in TestingWorkspaceView)
 *   Band 3 — triage: search · staff · icon-sort · portal
 *
 * House Band-1 law (Unbox golden · To-ship desk exemplar): fixed process tabs
 * for every staffer — never Chrome-style unpin of a system stage · Pin-list cube
 * omitted (honest absence — no closed foreign-collection catalog) · Views on
 * Band 3 (`WorkbenchViewsMenu` in the triage `views` slot, never Band-1 leading)
 * · page-pin in GlobalHeader. Three pin scopes never share a trigger/store. SoT:
 * source-of-truth.md → Workbench Band-1 strip · Left-edge → SCOPE decides its home.
 */

import { useState, type Ref } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  WorkbenchChromeHeader,
  WorkbenchTriageBand,
} from '@/components/dashboard/workbench-shell';
import { WorkbenchKpiCollapseToggle } from '@/components/dashboard/workbench-kpi-collapse';
import { QueueSortSwitch } from '@/components/dashboard/QueueSortSwitch';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import { StaffFilterRows } from '@/components/ui/StaffFilterButton';
import { WorkbenchFilterPopover } from '@/components/dashboard/workbench-filter-popover';
import { STAFF_FILTER_PARAM } from '@/hooks/useStaffFilter';
import { useWorkbenchSearchParam } from '@/hooks/useWorkbenchSearchParam';
import { useQueueDisplaySort } from '@/hooks/useQueueDisplaySort';
import {
  TESTING_WORKSPACE_TAB_LABEL,
  TESTING_WORKSPACE_TABS,
  type TestingWorkspaceTab,
} from '@/utils/testing-workspace-state';
import { WorkbenchViewsMenu } from '@/components/saved-views/WorkbenchViewsMenu';
import {
  SAVED_VIEW_PARAM_KEYS,
  SAVED_VIEW_STORAGE_KEY,
} from '@/lib/station/table-url-params';

const TAB_COLOR: Record<TestingWorkspaceTab, 'red' | 'orange' | 'blue' | 'gray' | 'emerald'> = {
  urgent: 'red',
  returns: 'orange',
  pending: 'blue',
  all: 'gray',
  history: 'emerald',
};

function searchPlaceholder(tab: TestingWorkspaceTab): string {
  switch (tab) {
    case 'history':
      return 'Search tested lines…';
    case 'returns':
      return 'Search return queue…';
    case 'urgent':
      return 'Search urgent queue…';
    case 'all':
      return 'Search all triage…';
    default:
      return 'Search pending tests…';
  }
}

/** Band 1 — lifecycle tabs only. Search / sort / staff live on {@link TestingTriageBand}. */
export function TestingWorkspaceHeader({
  tab,
  onSelectTab,
  className,
}: {
  tab: TestingWorkspaceTab;
  onSelectTab: (tab: TestingWorkspaceTab) => void;
  className?: string;
}) {
  const tabs = TESTING_WORKSPACE_TABS.map((id) => ({
    id,
    label: TESTING_WORKSPACE_TAB_LABEL[id],
    color: TAB_COLOR[id],
    dividerBefore: id === 'history',
  }));

  return (
    <WorkbenchChromeHeader
      density="band"
      tabs={tabs}
      activeTab={tab}
      onTabChange={(id) => onSelectTab(id as TestingWorkspaceTab)}
      solidTone="accent"
      className={className}
    />
  );
}

/**
 * Band 3 — find-only command row: dominant find left (staff refine in-field),
 * display sort + ▦ portal right, Unbox KPI collapse leading.
 *
 * **No `trailing` inspector toggle, on any tab including Returns — honest
 * absence, ruled 2026-08-08.** The empty right edge is the correct render, not
 * a gap to fill. `WorkbenchInspectorToggle` parks / reopens a desk
 * `RightRailHost` peek, and Testing has none:
 *
 *  1. **Rows claim the bench, they do not peek.** `TestingHistoryList` opens a
 *     line through `dispatchSelectLine` → `TestingPanel`, which covers this
 *     whole browse (`TestingLineWorkspace` hides the view behind it). Band 3 is
 *     off screen the moment a row opens, so a toggle here would have nothing to
 *     park for the record just picked.
 *  2. **The one reusable desk peek is welded to Unbox History.**
 *     `HistoryCartonTriagePanel` (`detail:history`) mounts
 *     `HistoryViewChromeBridge` + `HistoryViewTopicsCluster` — paint · Drill|
 *     List · compare · zoom · ▦ · KPI. Mounting it here would ship sheet-layout
 *     chrome for a sheet Testing does not have (chrome inventing a second
 *     story — Kinetic Ledger law 1).
 *  3. So giving Testing a peek means a **new** occupant + panel + topic map,
 *     and a changed selection semantic on a live floor queue (today a click
 *     claims the return). That is a product decision, not a wiring line.
 *
 * If it is ever built: add the occupant to `RECEIVING_RAIL_OCCUPANT_ID` (+ its
 * occupancy test), pass `trailing={<WorkbenchInspectorToggle …/>}` here, and
 * move this file from `NO_DESK_PEEK_SURFACES` to `INSPECTOR_TOGGLE_SURFACES` in
 * `band3-find-only.guard.test.ts`. Never mount the toggle first.
 */
export function TestingTriageBand({
  tab,
  controlsSlotRef,
  kpiOpen,
  onToggleKpi,
  className,
}: {
  tab: TestingWorkspaceTab;
  controlsSlotRef?: Ref<HTMLDivElement>;
  kpiOpen: boolean;
  onToggleKpi: () => void;
  className?: string;
}) {
  const { searchQuery, setSearch } = useWorkbenchSearchParam();
  const { sort, setSort } = useQueueDisplaySort();
  const showSort = tab === 'pending' || tab === 'returns' || tab === 'urgent';
  // Ownership facet: History (Me-default) + queue tabs Pending · Urgent · Returns.
  // All is a cross-queue typed triage (TechAllTriageTable) — staff scope is out of
  // scope for that surface (ownership handoff covers the needs-test queue only).
  const showStaff = tab === 'history' || showSort;

  // Ownership facet on queue + History. History keeps Me-default (allToken);
  // queue tabs use Option A — absent = All pool, pick a tech to focus.
  //
  // It rides IN the find field as ROWS of the one refine funnel, not as its own
  // `User` glyph beside it: the field carries a single mark and that mark is the
  // funnel (`workbench-filter-popover.tsx` → the one-icon law).
  const searchParams = useSearchParams();
  const [refineOpen, setRefineOpen] = useState(false);
  const staffHot = Boolean(
    tab === 'history'
      ? (searchParams.get(STAFF_FILTER_PARAM) ?? '').trim().toLowerCase() !== 'all'
      : searchParams.get(STAFF_FILTER_PARAM),
  );
  const inFieldRefine = showStaff ? (
    <WorkbenchFilterPopover
      open={refineOpen}
      onOpenChange={setRefineOpen}
      hot={staffHot}
      label="Refine"
      density="field"
    >
      <StaffFilterRows
        groupLabel="Technician"
        allLabel="All technicians"
        allToken={tab === 'history' ? 'all' : undefined}
        onPick={() => setRefineOpen(false)}
      />
    </WorkbenchFilterPopover>
  ) : null;

  const right = showSort ? (
    <QueueSortSwitch sort={sort} onChange={setSort} variant="icon" />
  ) : null;

  return (
    <WorkbenchTriageBand
      className={className}
      kpiToggle={
        <WorkbenchKpiCollapseToggle open={kpiOpen} onToggle={onToggleKpi} />
      }
      views={
        tab === 'history' ? (
          <WorkbenchViewsMenu
            storageKey={SAVED_VIEW_STORAGE_KEY.testing_history}
            paramKeys={SAVED_VIEW_PARAM_KEYS.testing_history}
            emptyHint="No saved views yet — refine Testing History, then save it here."
          />
        ) : null
      }
      search={
        <TechRailSearchBar
          variant="chrome"
          value={searchQuery}
          onChange={setSearch}
          placeholder={searchPlaceholder(tab)}
          className="min-w-0 flex-1"
          trailingSuffix={inFieldRefine}
        />
      }
      right={right}
      controlsSlotRef={controlsSlotRef}
      controlsSlotProps={{ 'data-testing-controls': '' }}
    />
  );
}
