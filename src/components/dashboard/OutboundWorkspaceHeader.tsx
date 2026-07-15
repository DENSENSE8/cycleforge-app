'use client';

/**
 * Outbound workspace chrome — one unified header bar for Dashboard · Outbound.
 *
 * Left:  lifecycle tabs (To Ship count only).
 * Right: [◀ exact filters…] [All N] | staff / table controls portal.
 *
 * Expand/collapse sits immediately left of All only — not next to the tabs.
 */

import { useMemo, type Ref } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  DASHBOARD_ORDER_VIEW_LABEL,
  type DashboardOrderView,
} from '@/utils/dashboard-search-state';
import {
  OutboundAllFilterButton,
  OutboundExactFilters,
  useToShipFilterHotkeys,
} from '@/components/dashboard/OutboundFilterStrip';
import { OutboundSavedViewChips } from '@/components/dashboard/OutboundSavedViewChips';
import { WorkbenchChromeHeader } from '@/components/dashboard/workbench-shell';
import { SearchField } from '@/design-system/primitives/SearchField';
import { useDashboardSearchController } from '@/hooks/useDashboardSearchController';
import { unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';

const LIFECYCLE_VIEWS = ['unshipped', 'packed', 'shipped'] as const;
type LifecycleView = (typeof LIFECYCLE_VIEWS)[number];

function isLifecycleView(view: DashboardOrderView): view is LifecycleView {
  return view === 'unshipped' || view === 'packed' || view === 'shipped';
}

export interface OutboundWorkspaceHeaderProps {
  orderView: DashboardOrderView;
  onSelectView: (view: DashboardOrderView) => void;
  controlsSlotRef?: Ref<HTMLDivElement>;
  className?: string;
}

export function OutboundWorkspaceHeader({
  orderView,
  onSelectView,
  controlsSlotRef,
  className,
}: OutboundWorkspaceHeaderProps) {
  const active = isLifecycleView(orderView) ? orderView : 'unshipped';
  const { data: queueCounts } = useQuery(unshippedQueueCountsQuery());
  const { searchQuery, setSearch } = useDashboardSearchController();
  useToShipFilterHotkeys(active === 'unshipped');

  // Counts only on To Ship; Packed/Shipped stay label-only.
  const tabs = useMemo(
    () =>
      LIFECYCLE_VIEWS.map((id) => ({
        id,
        label: DASHBOARD_ORDER_VIEW_LABEL[id],
        count: id === 'unshipped' ? queueCounts?.total : undefined,
        color: (id === 'unshipped' ? 'blue' : id === 'packed' ? 'orange' : 'emerald') as
          | 'blue'
          | 'orange'
          | 'emerald',
      })),
    [queueCounts?.total],
  );

  return (
    <WorkbenchChromeHeader
      tabs={tabs}
      activeTab={active}
      onTabChange={(id) => onSelectView(id as DashboardOrderView)}
      solidTone="accent"
      controlsSlotRef={controlsSlotRef}
      controlsSlotProps={{ 'data-outbound-controls': '' }}
      className={className}
      // Scoped list filter over ?search= (header slot) — the ⌘K pill stays global.
      search={
        <SearchField
          value={searchQuery}
          onChange={setSearch}
          onClear={() => setSearch('')}
          placeholder="Filter orders…"
          tone="blue"
          size="compact"
          className="w-40 shrink-0 lg:w-56"
        />
      }
      // [◀ filters] [All N] [saved view chips]
      right={
        <div className="flex min-w-0 shrink-0 items-center gap-1.5">
          <OutboundExactFilters mode={active} />
          <OutboundAllFilterButton mode={active} />
          <OutboundSavedViewChips mode={active} />
        </div>
      }
    />
  );
}
