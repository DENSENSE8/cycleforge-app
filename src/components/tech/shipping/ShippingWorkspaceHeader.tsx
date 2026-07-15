'use client';

/**
 * Shipping workspace chrome — tabs left (Pending · FBA | History), filters +
 * controls portal right. Mirrors OutboundWorkspaceHeader for `/test` Shipping.
 */

import { useMemo, type Ref } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  OutboundAllFilterButton,
  OutboundExactFilters,
  useToShipFilterHotkeys,
} from '@/components/dashboard/OutboundFilterStrip';
import { OutboundSavedViewChips } from '@/components/dashboard/OutboundSavedViewChips';
import { WorkbenchChromeHeader } from '@/components/dashboard/workbench-shell';
import { SearchField } from '@/design-system/primitives/SearchField';
import { StaffFilterButton } from '@/components/ui/StaffFilterButton';
import { useWorkbenchSearchParam } from '@/hooks/useWorkbenchSearchParam';
import { unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';
import {
  SHIPPING_WORKSPACE_TAB_LABEL,
  type ShippingWorkspaceTab,
} from '@/utils/shipping-workspace-state';
import { ChevronRight } from '@/components/Icons';

const TABS: ShippingWorkspaceTab[] = ['pending', 'fba', 'history'];

export interface ShippingWorkspaceHeaderProps {
  tab: ShippingWorkspaceTab;
  onSelectTab: (tab: ShippingWorkspaceTab) => void;
  controlsSlotRef?: Ref<HTMLDivElement>;
  className?: string;
}

export function ShippingWorkspaceHeader({
  tab,
  onSelectTab,
  controlsSlotRef,
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
        color: (id === 'pending' ? 'blue' : id === 'fba' ? 'orange' : 'emerald') as
          | 'blue'
          | 'orange'
          | 'emerald',
        dividerBefore: id === 'history',
      })),
    [queueCounts?.total],
  );

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
      search={
        tab === 'pending' ? (
          <SearchField
            value={searchQuery}
            onChange={setSearch}
            onClear={() => setSearch('')}
            placeholder="Filter orders…"
            tone="blue"
            size="compact"
            className="w-40 shrink-0 lg:w-56"
          />
        ) : undefined
      }
      right={
        <>
          {tab === 'pending' ? (
            <div className="flex min-w-0 shrink-0 items-center gap-1.5">
              <OutboundExactFilters mode="unshipped" />
              <OutboundAllFilterButton mode="unshipped" />
              <OutboundSavedViewChips mode="unshipped" />
            </div>
          ) : null}

          {tab === 'fba' ? (
            <Link
              href="/outbound?mode=fba"
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border-soft bg-surface-card px-3 text-role-caption font-semibold text-text-muted transition-colors hover:bg-surface-hover hover:text-text-default"
            >
              FBA station
              <ChevronRight className="h-3.5 w-3.5 opacity-70" />
            </Link>
          ) : null}

          {tab === 'history' ? (
            <StaffFilterButton
              align="start"
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
