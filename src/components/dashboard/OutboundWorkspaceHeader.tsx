'use client';

/**
 * Outbound workspace chrome — one unified header bar for Dashboard · Outbound.
 *
 * Left:  lifecycle tabs (Pending · Tested · Packed · Shipped).
 * Right: search · filters · (portal) · sort · Import · Add.
 * Row select lives in the table left gutter (always on), not chrome.
 */

import { useMemo, type Ref } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  DASHBOARD_ORDER_VIEW_LABEL,
  isPrePackOrderView,
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
import { fulfillmentCountsFromCombos } from '@/lib/unshipped-state';

const LIFECYCLE_VIEWS = ['unshipped', 'tested', 'packed', 'shipped'] as const;
type LifecycleView = (typeof LIFECYCLE_VIEWS)[number];

function isLifecycleView(view: DashboardOrderView): view is LifecycleView {
  return (
    view === 'unshipped' || view === 'tested' || view === 'packed' || view === 'shipped'
  );
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
  useToShipFilterHotkeys(isPrePackOrderView(active));

  const fromCombos = fulfillmentCountsFromCombos(queueCounts?.combos ?? []);
  const pendingCount =
    (fromCombos.PENDING || queueCounts?.byStage.pending || 0) + (fromCombos.BLOCKED || 0);
  const testedCount = fromCombos.TESTED || queueCounts?.byStage.tested || 0;

  // Counts on Pending + Tested; Packed/Shipped stay label-only.
  const tabs = useMemo(
    () =>
      LIFECYCLE_VIEWS.map((id) => ({
        id,
        label: DASHBOARD_ORDER_VIEW_LABEL[id],
        count: id === 'unshipped' ? pendingCount : id === 'tested' ? testedCount : undefined,
        color: (id === 'unshipped'
          ? 'blue'
          : id === 'tested'
            ? 'teal'
            : id === 'packed'
              ? 'orange'
              : 'emerald') as 'blue' | 'teal' | 'orange' | 'emerald',
      })),
    [pendingCount, testedCount],
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
      // [⚡] [⫶ lane/status] filters. Select-all lives in the table column
      // header (left gutter ☐), not chrome. Display sort is trailing (quiet).
      right={<OutboundExactFilters mode={active} />}
      trailing={
        /* Sort (dropdown) → Import (blue) → Add (green) — same CTA cluster as Labels. */
        <>
          {isPrePackOrderView(active) ? <QueueSortSwitch sort={sort} onChange={setSort} /> : null}
          <OutboundOrderChromeActions onNewOrder={openIntakeForm} />
        </>
      }
    />
  );
}
