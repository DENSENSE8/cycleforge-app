'use client';

/**
 * Outbound workspace chrome — one unified header bar for Dashboard · Outbound.
 *
 * Left:  lifecycle tabs (To Ship count only).
 * Right: search · filters · Import · Add · staff/columns portal.
 * Row select lives in the table left gutter (always on), not chrome.
 */

import { useMemo, type Ref } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  DASHBOARD_ORDER_VIEW_LABEL,
  type DashboardOrderView,
} from '@/utils/dashboard-search-state';
import { OutboundExactFilters, useToShipFilterHotkeys } from '@/components/dashboard/OutboundFilterStrip';
import { QueueSortSwitch } from '@/components/dashboard/QueueSortSwitch';
import { WorkbenchChromeHeader } from '@/components/dashboard/workbench-shell';
import { OutboundOrderChromeActions } from '@/components/dashboard/OutboundOrderChromeActions';
import { ToolbarSearchToggle } from '@/components/ui/ToolbarSearchToggle';
import { useDashboardSearchController } from '@/hooks/useDashboardSearchController';
import { useQueueDisplaySort } from '@/hooks/useQueueDisplaySort';
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
  const { searchQuery, setSearch, openIntakeForm } = useDashboardSearchController();
  const { sort, setSort } = useQueueDisplaySort();
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
        <ToolbarSearchToggle
          value={searchQuery}
          onChange={setSearch}
          onClear={() => setSearch('')}
          placeholder="Filter orders…"
          tone="blue"
        />
      }
      // [⚡] [⫶ lane/status] + Pending display sort (Priority|Newest|Deadline).
      // Select-all lives in the table column header (left gutter ☐), not chrome.
      right={
        <>
          {active === 'unshipped' ? <QueueSortSwitch sort={sort} onChange={setSort} /> : null}
          <OutboundExactFilters mode={active} />
        </>
      }
      trailing={
        /* Import + Add — same CTAs as Labels / Pack / `/test` Shipping. */
        <OutboundOrderChromeActions onNewOrder={openIntakeForm} />
      }
    />
  );
}
