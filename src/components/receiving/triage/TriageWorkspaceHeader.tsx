'use client';

import type { Ref } from 'react';
import { useQuery } from '@tanstack/react-query';
import { WorkbenchChromeHeader } from '@/components/dashboard/workbench-shell';
import { BoardSelectToggle } from '@/components/board/BoardSelectToggle';
import { StaffFilterButton } from '@/components/ui/StaffFilterButton';
import {
  TRIAGE_WORKSPACE_TAB_LABEL,
  type TriageWorkspaceTab,
} from '@/utils/triage-workspace-state';

// Active-work tabs first; Done (history-like) sits rightmost with a divider —
// mirrors UnboxWorkspaceHeader (Queue · Viewed · History).
const TABS: TriageWorkspaceTab[] = ['triage', 'found', 'unfound', 'done'];

export function TriageWorkspaceHeader({
  tab,
  onSelectTab,
  controlsSlotRef,
  selectMode = false,
  onToggleSelectMode,
  className,
}: {
  tab: TriageWorkspaceTab;
  onSelectTab: (tab: TriageWorkspaceTab) => void;
  controlsSlotRef?: Ref<HTMLDivElement>;
  selectMode?: boolean;
  onToggleSelectMode?: () => void;
  className?: string;
}) {
  const { data: unfoundCount } = useQuery({
    queryKey: ['triage-unfound-badge'] as const,
    queryFn: async () => {
      const params = new URLSearchParams({
        kind: 'unmatched_receiving',
        limit: '1',
        offset: '0',
      });
      const res = await fetch(`/api/receiving/unfound-queue?${params.toString()}`, {
        cache: 'no-store',
      });
      if (!res.ok) return 0;
      const body = (await res.json()) as { total?: number; rows?: unknown[] };
      if (typeof body.total === 'number') return body.total;
      return Array.isArray(body.rows) ? body.rows.length : 0;
    },
    staleTime: 20_000,
  });

  const tabs = TABS.map((id) => ({
    id,
    label: TRIAGE_WORKSPACE_TAB_LABEL[id],
    count:
      id === 'unfound' && typeof unfoundCount === 'number' && unfoundCount > 0
        ? unfoundCount
        : undefined,
    color: (id === 'found'
      ? 'orange'
      : id === 'unfound'
        ? 'orange'
        : id === 'done'
          ? 'emerald'
          : 'blue') as 'blue' | 'orange' | 'emerald',
    dividerBefore: id === 'done',
  }));

  return (
    <WorkbenchChromeHeader
      tabs={tabs}
      activeTab={tab}
      onTabChange={(id) => onSelectTab(id as TriageWorkspaceTab)}
      solidTone="accent"
      controlsSlotRef={controlsSlotRef}
      controlsSlotProps={{ 'data-triage-controls': '' }}
      className={className}
      right={<StaffFilterButton iconOnly align="end" />}
      trailing={
        onToggleSelectMode ? (
          <BoardSelectToggle active={selectMode} onToggle={onToggleSelectMode} />
        ) : undefined
      }
    />
  );
}
