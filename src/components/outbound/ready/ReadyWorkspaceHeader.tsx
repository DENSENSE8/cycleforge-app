'use client';

import { useMemo } from 'react';
import { WorkbenchChromeHeader } from '@/components/dashboard/workbench-shell';
import { ToolbarSearchToggle } from '@/components/ui/ToolbarSearchToggle';
import {
  READY_WORKSPACE_TAB_LABEL,
  type ReadyWorkspaceTab,
} from '@/utils/ready-workspace-state';

export interface ReadyWorkspaceCounts {
  all: number;
  fba: number;
  prebox: number;
  hold: number;
  staged: number;
}

const TABS: Array<{
  id: ReadyWorkspaceTab;
  color: 'blue' | 'purple' | 'emerald' | 'orange';
}> = [
  { id: 'all', color: 'blue' },
  { id: 'fba', color: 'purple' },
  { id: 'prebox', color: 'emerald' },
  { id: 'hold', color: 'orange' },
];

export function ReadyWorkspaceHeader({
  tab,
  onSelectTab,
  search,
  onSearch,
  counts,
}: {
  tab: ReadyWorkspaceTab;
  onSelectTab: (tab: ReadyWorkspaceTab) => void;
  search: string;
  onSearch: (value: string) => void;
  counts: ReadyWorkspaceCounts;
}) {
  const tabs = useMemo(
    () =>
      TABS.map(({ id, color }) => ({
        id,
        label: READY_WORKSPACE_TAB_LABEL[id],
        color,
        count: counts[id],
      })),
    [counts],
  );

  return (
    <WorkbenchChromeHeader
      tabs={tabs}
      activeTab={tab}
      onTabChange={(id) => onSelectTab(id as ReadyWorkspaceTab)}
      solidTone="accent"
      search={
        <ToolbarSearchToggle
          value={search}
          onChange={onSearch}
          onClear={() => onSearch('')}
          placeholder="Search tested units…"
          tone="blue"
        />
      }
    />
  );
}
