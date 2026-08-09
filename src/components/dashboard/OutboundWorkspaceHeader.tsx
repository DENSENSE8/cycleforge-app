'use client';

/**
 * Outbound workspace chrome — To-ship Sheets flush stack (Unbox History recipe):
 *
 *   Band 1 — tabs + Import / Add
 *   Band 2 — KPI (DashboardOrdersView)
 *   Band 3 — find-only command row + Show/Hide inspector (View topics on rail)
 */

import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import {
  DASHBOARD_ORDER_VIEW_LABEL,
  isPrePackOrderView,
  type DashboardOrderView,
} from '@/utils/dashboard-search-state';
import { useToShipFilterHotkeys } from '@/components/dashboard/OutboundFilterStrip';
import {
  WorkbenchChromeHeader,
  WorkbenchTrailingCluster,
  WorkbenchTriageBand,
} from '@/components/dashboard/workbench-shell';
import { OutboundOrderChromeActions } from '@/components/dashboard/OutboundOrderChromeActions';
import { OutboundViewsMenu } from '@/components/dashboard/OutboundViewsMenu';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import { useDashboardSearchController } from '@/hooks/useDashboardSearchController';
import { parseStaffParam } from '@/hooks/useStaffFilter';
import { unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';
import { fulfillmentCountsFromCombos } from '@/lib/unshipped-state';
import { useOrdersViewChrome } from '@/components/outbound/orders/orders-view-chrome-context';
import { useRailActionSnapshot } from '@/components/dashboard/rail/OrderRailActions';
import { WorkbenchInspectorToggle } from '@/components/dashboard/workbench-inspector-toggle';

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

/** Band 1 — tabs + trailing CTAs. Find / inspector park live on {@link OutboundTriageBand}. */
export function OutboundWorkspaceHeader({
  orderView,
  onSelectView,
  className,
}: OutboundWorkspaceHeaderProps) {
  const active = isLifecycleView(orderView) ? orderView : 'unshipped';
  const searchParams = useSearchParams();
  const staffId = parseStaffParam(searchParams.get('staff')) ?? undefined;
  const { data: queueCounts } = useQuery(unshippedQueueCountsQuery({ staffId }));
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
          before={<OutboundViewsMenu />}
          actions={<OutboundOrderChromeActions onNewOrder={openIntakeForm} />}
        />
      }
    />
  );
}

/**
 * Band 3 — find-only command row (Unbox History golden): flex-1 search +
 * far-right Show/Hide inspector. Sheet refine / layout / KPI live on the
 * pushing right inspector View cluster.
 */
export function OutboundTriageBand({
  orderView,
  className,
}: {
  orderView: DashboardOrderView;
  className?: string;
}) {
  const active = isLifecycleView(orderView) ? orderView : 'unshipped';
  const { searchQuery, setSearch } = useDashboardSearchController();
  const { viewShellOpen, setViewShellOpen } = useOrdersViewChrome();
  const searchParams = useSearchParams();
  const { rows } = useRailActionSnapshot();
  const openOrderId = searchParams.get('openOrderId');
  const inspectorOpen =
    Boolean(openOrderId) || rows.length > 0 || viewShellOpen;

  useToShipFilterHotkeys(isPrePackOrderView(active));

  const openViewShell = useCallback(() => setViewShellOpen(true), [setViewShellOpen]);

  const inspectorToggle = (
    <WorkbenchInspectorToggle
      open={inspectorOpen}
      onOpenEmpty={openViewShell}
      testId="orders-inspector-toggle"
    />
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
          className="min-w-0 flex-1"
        />
      }
      trailing={inspectorToggle}
    />
  );
}
