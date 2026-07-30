'use client';

/**
 * Shipping workspace chrome — tabs left (Pending | History), filters +
 * controls portal right. Mirrors OutboundWorkspaceHeader for `/test` Shipping.
 * Row select lives in the table left gutter (always on), not chrome.
 */

import { useMemo, type ReactNode, type Ref } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  OutboundExactFilters,
  useToShipFilterHotkeys,
} from '@/components/dashboard/OutboundFilterStrip';
import { WorkbenchChromeHeader } from '@/components/dashboard/workbench-shell';
import { OutboundOrderChromeActions } from '@/components/dashboard/OutboundOrderChromeActions';
import { ToolbarSearchToggle } from '@/components/ui/ToolbarSearchToggle';
import { StaffFilterButton } from '@/components/ui/StaffFilterButton';
import { useWorkbenchSearchParam } from '@/hooks/useWorkbenchSearchParam';
import { unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';
import {
  SHIPPING_WORKSPACE_TAB_LABEL,
  type ShippingWorkspaceTab,
} from '@/utils/shipping-workspace-state';

const TABS: ShippingWorkspaceTab[] = ['pending', 'history'];

export interface ShippingWorkspaceHeaderProps {
  tab: ShippingWorkspaceTab;
  onSelectTab: (tab: ShippingWorkspaceTab) => void;
  controlsSlotRef?: Ref<HTMLDivElement>;
  /** Open new-order entry (slide-over). */
  onNewOrder?: () => void;
  className?: string;
}

export function ShippingWorkspaceHeader({
  tab,
  onSelectTab,
  controlsSlotRef,
  onNewOrder,
  className,
}: ShippingWorkspaceHeaderProps) {
  const { data: queueCounts } = useQuery(unshippedQueueCountsQuery());
  const { searchQuery, setSearch } = useWorkbenchSearchParam();
  useToShipFilterHotkeys(tab === 'pending');

  const tabs = useMemo(
    () =>
      TABS.map((id) => ({
        id,
        label: SHIPPING_WORKSPACE_TAB_LABEL[id],
        count: id === 'pending' ? queueCounts?.total : undefined,
        color: (id === 'pending' ? 'blue' : 'emerald') as 'blue' | 'emerald',
        dividerBefore: id === 'history',
      })),
    [queueCounts?.total],
  );
  const chromeByTab: Record<
    ShippingWorkspaceTab,
    { search?: ReactNode; right?: ReactNode }
  > = {
    pending: {
      search: (
        <ToolbarSearchToggle
          value={searchQuery}
          onChange={setSearch}
          onClear={() => setSearch('')}
          placeholder="Filter orders…"
          tone="blue"
        />
      ),
      right: <OutboundExactFilters mode="unshipped" />,
    },
    history: {
      right: (
        <StaffFilterButton
          iconOnly
          allLabel="All technicians"
          allToken="all"
          meLabel="You"
        />
      ),
    },
  };
  const chrome = chromeByTab[tab];

  return (
    <WorkbenchChromeHeader
      tabs={tabs}
      activeTab={tab}
      onTabChange={(id) => onSelectTab(id as ShippingWorkspaceTab)}
      solidTone="accent"
      controlsSlotRef={controlsSlotRef}
      controlsSlotProps={{ 'data-shipping-controls': '' }}
      className={className}
      // Scoped list filter over ?search= (pending list reads it directly);
      // only shown where the tab's list actually filters on it.
      search={chrome.search}
      right={chrome.right}
      trailing={onNewOrder ? <OutboundOrderChromeActions onNewOrder={onNewOrder} /> : undefined}
    />
  );
}
