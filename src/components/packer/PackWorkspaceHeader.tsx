'use client';

/**
 * Pack workspace chrome — tabs left (Queue | History), filters + controls
 * portal right. Mirrors ShippingWorkspaceHeader for `/pack`.
 * Row select lives in the table left gutter (always on), not chrome.
 */

import { useEffect, useMemo, type ReactNode, type Ref } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  OutboundExactFilters,
  useToShipFilterHotkeys,
} from '@/components/dashboard/OutboundFilterStrip';
import { WorkbenchChromeHeader, WorkbenchTrailingCluster } from '@/components/dashboard/workbench-shell';
import { OutboundOrderChromeActions } from '@/components/dashboard/OutboundOrderChromeActions';
import { ToolbarSearchToggle } from '@/components/ui/ToolbarSearchToggle';
import { StaffFilterButton } from '@/components/ui/StaffFilterButton';
import { useWorkbenchSearchParam } from '@/hooks/useWorkbenchSearchParam';
import { unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';
import {
  PACK_WORKSPACE_TAB_LABEL,
  type PackWorkspaceTab,
} from '@/utils/pack-workspace-state';

const TABS: PackWorkspaceTab[] = ['queue', 'history'];

export function PackWorkspaceHeader({
  tab,
  onSelectTab,
  controlsSlotRef,
  onNewOrder,
  className,
}: {
  tab: PackWorkspaceTab;
  onSelectTab: (tab: PackWorkspaceTab) => void;
  controlsSlotRef?: Ref<HTMLDivElement>;
  /** Open new-order entry (slide-over). */
  onNewOrder?: () => void;
  className?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: queueCounts } = useQuery(unshippedQueueCountsQuery());
  const { searchQuery, setSearch } = useWorkbenchSearchParam();
  useToShipFilterHotkeys(tab === 'queue');

  // Pack Queue opens on the TESTED (ready-to-pack) lane when no ustatus is set.
  useEffect(() => {
    if (tab !== 'queue') return;
    if (String(searchParams.get('ustatus') || '').trim()) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('ustatus', 'TESTED');
    const qs = params.toString();
    const base = pathname || '/pack';
    router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
  }, [tab, searchParams, pathname, router]);

  const tabs = useMemo(
    () =>
      TABS.map((id) => ({
        id,
        label: PACK_WORKSPACE_TAB_LABEL[id],
        count: id === 'queue' ? (queueCounts?.byStage.tested ?? queueCounts?.total) : undefined,
        color: (id === 'queue' ? 'teal' : 'emerald') as 'teal' | 'emerald',
        dividerBefore: id === 'history',
      })),
    [queueCounts?.byStage.tested, queueCounts?.total],
  );

  const chromeByTab: Record<PackWorkspaceTab, { search?: ReactNode; right?: ReactNode }> = {
    queue: {
      search: (
        <ToolbarSearchToggle
          value={searchQuery}
          onChange={setSearch}
          onClear={() => setSearch('')}
          placeholder="Filter ready-to-pack…"
          tone="emerald"
        />
      ),
      right: <OutboundExactFilters mode="unshipped" />,
    },
    history: {
      right: (
        <StaffFilterButton
          iconOnly
          allLabel="All packers"
          allToken="all"
          meLabel="You"
        />
      ),
    },
  };
  const chrome = chromeByTab[tab];

  return (
    <WorkbenchChromeHeader
      density="band"
      tabs={tabs}
      activeTab={tab}
      onTabChange={(id) => onSelectTab(id as PackWorkspaceTab)}
      solidTone="accent"
      controlsSlotRef={controlsSlotRef}
      controlsSlotProps={{ 'data-pack-controls': '' }}
      className={className}
      search={chrome.search}
      right={chrome.right}
      trailing={
        onNewOrder ? (
          <WorkbenchTrailingCluster
            actions={<OutboundOrderChromeActions onNewOrder={onNewOrder} />}
          />
        ) : undefined
      }
    />
  );
}
