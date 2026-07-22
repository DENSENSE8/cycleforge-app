'use client';

import type { Ref } from 'react';
import { WorkbenchChromeHeader } from '@/components/dashboard/workbench-shell';
import { QueueSortSwitch } from '@/components/dashboard/QueueSortSwitch';
import { ToolbarSearchToggle } from '@/components/ui/ToolbarSearchToggle';
import { StaffFilterButton } from '@/components/ui/StaffFilterButton';
import { useWorkbenchSearchParam } from '@/hooks/useWorkbenchSearchParam';
import { useQueueDisplaySort } from '@/hooks/useQueueDisplaySort';
import {
  TESTING_WORKSPACE_TAB_LABEL,
  type TestingWorkspaceTab,
} from '@/utils/testing-workspace-state';

const TABS: TestingWorkspaceTab[] = ['returns', 'pending', 'history'];

export function TestingWorkspaceHeader({
  tab,
  onSelectTab,
  controlsSlotRef,
  className,
}: {
  tab: TestingWorkspaceTab;
  onSelectTab: (tab: TestingWorkspaceTab) => void;
  controlsSlotRef?: Ref<HTMLDivElement>;
  className?: string;
}) {
  const { searchQuery, setSearch } = useWorkbenchSearchParam();
  const { sort, setSort } = useQueueDisplaySort();
  const showSort = tab === 'pending' || tab === 'returns';
  const tabs = TABS.map((id) => ({
    id,
    label: TESTING_WORKSPACE_TAB_LABEL[id],
    color: (id === 'pending' ? 'blue' : id === 'returns' ? 'orange' : 'emerald') as
      | 'blue'
      | 'orange'
      | 'emerald',
    dividerBefore: id === 'history',
  }));

  return (
    <WorkbenchChromeHeader
      tabs={tabs}
      activeTab={tab}
      onTabChange={(id) => onSelectTab(id as TestingWorkspaceTab)}
      solidTone="accent"
      controlsSlotRef={controlsSlotRef}
      controlsSlotProps={{ 'data-testing-controls': '' }}
      className={className}
      search={
        <ToolbarSearchToggle
          value={searchQuery}
          onChange={setSearch}
          onClear={() => setSearch('')}
          placeholder={
            tab === 'history'
              ? 'Search tested lines…'
              : tab === 'returns'
                ? 'Search return queue…'
                : 'Search pending tests…'
          }
          tone="blue"
        />
      }
      right={
        <>
          {showSort ? <QueueSortSwitch sort={sort} onChange={setSort} /> : null}
          {tab === 'history' ? (
            <StaffFilterButton
              iconOnly
              allLabel="All technicians"
              allToken="all"
              meLabel="You"
            />
          ) : null}
        </>
      }
    />
  );
}
