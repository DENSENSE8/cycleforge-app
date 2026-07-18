'use client';

import type { Ref } from 'react';
import { useQuery } from '@tanstack/react-query';
import { WorkbenchChromeHeader } from '@/components/dashboard/workbench-shell';
import { BoardSelectToggle } from '@/components/board/BoardSelectToggle';
import { StaffFilterButton } from '@/components/ui/StaffFilterButton';
import { parseStaffParam } from '@/hooks/useStaffFilter';
import { useSearchParams } from 'next/navigation';
import {
  UNBOX_WORKSPACE_TAB_LABEL,
  type UnboxWorkspaceTab,
} from '@/utils/unbox-workspace-state';

// Order mirrors TestingWorkspaceHeader — the history-like tab (Unboxed) sits
// rightmost (emerald, dividerBefore) after the active-work tabs (Queue, Viewed).
const TABS: UnboxWorkspaceTab[] = ['queue', 'viewed', 'recent'];

export function UnboxWorkspaceHeader({
  tab,
  onSelectTab,
  controlsSlotRef,
  selectMode = false,
  onToggleSelectMode,
  className,
}: {
  tab: UnboxWorkspaceTab;
  onSelectTab: (tab: UnboxWorkspaceTab) => void;
  controlsSlotRef?: Ref<HTMLDivElement>;
  selectMode?: boolean;
  onToggleSelectMode?: () => void;
  className?: string;
}) {
  const searchParams = useSearchParams();
  const staffId = parseStaffParam(searchParams.get('staff') ?? searchParams.get('staffId'));

  // Lightweight queue depth for the Queue tab badge — separate key from the
  // KPI strip's 200-row metrics fetch so React Query doesn't collide.
  const { data: queueCount } = useQuery({
    queryKey: ['unbox-queue-badge', staffId ?? 'all'],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: '1',
        offset: '0',
        view: 'scanned',
        sort: 'priority',
      });
      if (staffId != null) params.set('staff', String(staffId));
      const res = await fetch(`/api/receiving-lines?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) return 0;
      const body = (await res.json()) as { total?: number; receiving_lines?: unknown[] };
      if (typeof body.total === 'number') return body.total;
      return Array.isArray(body.receiving_lines) ? body.receiving_lines.length : 0;
    },
    staleTime: 20_000,
  });

  const tabs = TABS.map((id) => ({
    id,
    label: UNBOX_WORKSPACE_TAB_LABEL[id],
    count: id === 'queue' && typeof queueCount === 'number' && queueCount > 0 ? queueCount : undefined,
    color: (id === 'queue' ? 'orange' : id === 'viewed' ? 'blue' : 'emerald') as
      | 'blue'
      | 'orange'
      | 'emerald',
    dividerBefore: id === 'recent',
  }));

  return (
    <WorkbenchChromeHeader
      tabs={tabs}
      activeTab={tab}
      onTabChange={(id) => onSelectTab(id as UnboxWorkspaceTab)}
      solidTone="accent"
      controlsSlotRef={controlsSlotRef}
      controlsSlotProps={{ 'data-unbox-controls': '' }}
      className={className}
      right={
        tab !== 'viewed' ? (
          <StaffFilterButton iconOnly align="end" />
        ) : undefined
      }
      trailing={
        onToggleSelectMode ? (
          <BoardSelectToggle active={selectMode} onToggle={onToggleSelectMode} />
        ) : undefined
      }
    />
  );
}
