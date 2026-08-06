'use client';

/**
 * Testing workspace chrome — Sheets flush stack (Unbox / To-ship recipe):
 *
 *   Band 1 — tabs (Urgent · Returns · Pending · All · History)
 *   Band 2 — KPI (`WorkbenchKpiBand` in TestingWorkspaceView)
 *   Band 3 — triage: search · staff · icon-sort · portal
 */

import type { Ref } from 'react';
import {
  WorkbenchChromeHeader,
  WorkbenchTriageBand,
} from '@/components/dashboard/workbench-shell';
import { WorkbenchKpiCollapseToggle } from '@/components/dashboard/workbench-kpi-collapse';
import { QueueSortSwitch } from '@/components/dashboard/QueueSortSwitch';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import { StaffFilterButton } from '@/components/ui/StaffFilterButton';
import { useWorkbenchSearchParam } from '@/hooks/useWorkbenchSearchParam';
import { useQueueDisplaySort } from '@/hooks/useQueueDisplaySort';
import {
  TESTING_WORKSPACE_TAB_LABEL,
  TESTING_WORKSPACE_TABS,
  type TestingWorkspaceTab,
} from '@/utils/testing-workspace-state';

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

/** Band 3 — find left; staff · icon-sort · portal right. Leading = Unbox KPI collapse. */
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
  const right = (
    <>
      {showStaff ? (
        tab === 'history' ? (
          <StaffFilterButton
            iconOnly
            allLabel="All technicians"
            allToken="all"
            meLabel="You"
          />
        ) : (
          <StaffFilterButton iconOnly allLabel="All technicians" />
        )
      ) : null}
      {showSort ? <QueueSortSwitch sort={sort} onChange={setSort} variant="icon" /> : null}
    </>
  );

  return (
    <WorkbenchTriageBand
      className={className}
      kpiToggle={
        <WorkbenchKpiCollapseToggle open={kpiOpen} onToggle={onToggleKpi} />
      }
      search={
        <TechRailSearchBar
          variant="chrome"
          value={searchQuery}
          onChange={setSearch}
          placeholder={searchPlaceholder(tab)}
          className="w-40 shrink-0 lg:w-56"
        />
      }
      right={right}
      controlsSlotRef={controlsSlotRef}
      controlsSlotProps={{ 'data-testing-controls': '' }}
    />
  );
}
