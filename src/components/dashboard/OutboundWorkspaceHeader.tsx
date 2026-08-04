'use client';

/**
 * Outbound workspace chrome — To-ship Sheets flush stack (Unbox recipe):
 *
 *   Band 1 — tabs + Import / Add
 *   Band 2 — KPI (DashboardOrdersView)
 *   Band 3 — triage: search · paint · List|Drill · compare · filters · icon-sort · portal
 */

import { useMemo, type ReactNode, type Ref } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  DASHBOARD_ORDER_VIEW_LABEL,
  isPrePackOrderView,
  type DashboardOrderView,
} from '@/utils/dashboard-search-state';
import { OutboundExactFilters, useToShipFilterHotkeys } from '@/components/dashboard/OutboundFilterStrip';
import { QueueSortSwitch } from '@/components/dashboard/QueueSortSwitch';
import {
  WorkbenchChromeHeader,
  WorkbenchTrailingCluster,
  WorkbenchTriageBand,
} from '@/components/dashboard/workbench-shell';
import { OutboundOrderChromeActions } from '@/components/dashboard/OutboundOrderChromeActions';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import { useDashboardSearchController } from '@/hooks/useDashboardSearchController';
import { useQueueDisplaySort } from '@/hooks/useQueueDisplaySort';
import { unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';
import { fulfillmentCountsFromCombos } from '@/lib/unshipped-state';
import { OrdersRowPaintChrome } from '@/components/outbound/orders/OrdersRowPaintChrome';
import { OrdersDrillChrome } from '@/components/outbound/orders/OrdersDrillChrome';
import { OrdersCompareChrome } from '@/components/outbound/orders/OrdersCompareChrome';

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
  className?: string;
}

/** Band 1 — tabs + trailing CTAs. Search / sort / layout live on {@link OutboundTriageBand}. */
export function OutboundWorkspaceHeader({
  orderView,
  onSelectView,
  className,
}: OutboundWorkspaceHeaderProps) {
  const active = isLifecycleView(orderView) ? orderView : 'unshipped';
  const { data: queueCounts } = useQuery(unshippedQueueCountsQuery());
  const { openIntakeForm } = useDashboardSearchController();

  const fromCombos = fulfillmentCountsFromCombos(queueCounts?.combos ?? []);
  const pendingCount =
    (fromCombos.PENDING || queueCounts?.byStage.pending || 0) + (fromCombos.BLOCKED || 0);
  const testedCount = fromCombos.TESTED || queueCounts?.byStage.tested || 0;

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
      density="band"
      tabs={tabs}
      activeTab={active}
      onTabChange={(id) => onSelectView(id as DashboardOrderView)}
      solidTone="accent"
      className={className}
      trailing={
        <WorkbenchTrailingCluster
          actions={<OutboundOrderChromeActions onNewOrder={openIntakeForm} />}
        />
      }
    />
  );
}

/**
 * Band 3 — find left; paint · List|Drill · compare · filters · icon-sort · portal right.
 */
export function OutboundTriageBand({
  orderView,
  controlsSlotRef,
  className,
  layoutChrome,
}: {
  orderView: DashboardOrderView;
  controlsSlotRef?: Ref<HTMLDivElement>;
  className?: string;
  /** Extra leading chrome before filters (defaults: paint · drill · compare). */
  layoutChrome?: ReactNode;
}) {
  const active = isLifecycleView(orderView) ? orderView : 'unshipped';
  const { searchQuery, setSearch } = useDashboardSearchController();
  const { sort, setSort } = useQueueDisplaySort();
  useToShipFilterHotkeys(isPrePackOrderView(active));

  const right = (
    <>
      {layoutChrome ?? (
        <>
          <OrdersRowPaintChrome />
          <OrdersDrillChrome />
          <OrdersCompareChrome />
        </>
      )}
      <OutboundExactFilters mode={active} />
      {isPrePackOrderView(active) ? (
        <QueueSortSwitch sort={sort} onChange={setSort} variant="icon" />
      ) : null}
    </>
  );

  return (
    <WorkbenchTriageBand
      className={className}
      search={
        <TechRailSearchBar
          variant="chrome"
          value={searchQuery}
          onChange={setSearch}
          placeholder="Filter orders…"
          className="w-56 shrink-0 lg:w-72"
        />
      }
      right={right}
      controlsSlotRef={controlsSlotRef}
      controlsSlotProps={{ 'data-outbound-controls': '' }}
    />
  );
}
