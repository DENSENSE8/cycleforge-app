'use client';

/**
 * Shipping workspace chrome — tabs left (Pending · FBA | History), filters +
 * controls portal right. Mirrors OutboundWorkspaceHeader for `/test` Shipping.
 */

import { useMemo, type Ref } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import {
  OutboundAllFilterButton,
  OutboundExactFilters,
  useToShipFilterHotkeys,
} from '@/components/dashboard/OutboundFilterStrip';
import { OutboundSavedViewChips } from '@/components/dashboard/OutboundSavedViewChips';
import { StaffFilterButton } from '@/components/ui/StaffFilterButton';
import { unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';
import {
  SHIPPING_WORKSPACE_TAB_LABEL,
  type ShippingWorkspaceTab,
} from '@/utils/shipping-workspace-state';
import { ChevronRight } from '@/components/Icons';
import { cn } from '@/utils/_cn';

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
    <div
      className={cn(
        'flex min-w-0 shrink-0 items-center gap-3 rounded-2xl border border-border-soft bg-surface-card px-2.5 py-1.5 shadow-sm',
        className,
      )}
    >
      <TabSwitch
        tabs={tabs}
        activeTab={tab}
        onTabChange={(id) => onSelectTab(id as ShippingWorkspaceTab)}
        className="w-auto shrink-0"
        variant="solid"
        countStyle="plain"
        railClassName="rounded-full border border-border-default bg-surface-card p-1 shadow-sm"
      />

      <div className="min-w-0 flex-1" aria-hidden />

      <div className="flex min-w-0 shrink-0 items-center gap-2">
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

        {tab === 'history' ? <StaffFilterButton align="start" allLabel="All technicians" /> : null}

        <div
          ref={controlsSlotRef}
          className="flex shrink-0 items-center gap-2"
          data-shipping-controls
        />
      </div>
    </div>
  );
}
