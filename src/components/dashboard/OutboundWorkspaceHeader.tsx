'use client';

/**
 * Outbound workspace chrome — To-ship Sheets flush stack (Unbox History recipe):
 *
 *   Band 1 — fixed lifecycle system tabs + Add (ingest methods on the right rail)

 *   Band 2 — KPI (DashboardOrdersView)
 *   Band 3 — find-only command row + Views + Show/Hide inspector (View topics on rail)
 *
 * House Band-1 law (Unbox is golden; To-ship is the first desk exemplar):
 * fixed process tabs for every staffer · Pin-list cube omitted (honest absence —
 * no closed outbound foreign-collection catalog yet) · Views on Band 3 · page-pin
 * in GlobalHeader. Never Chrome-style unpin of Pending · Tested · Packed · Shipped;
 * never embed Unbox receiving here. SoT: source-of-truth.md → Workbench Band-1 strip
 * · Left-edge occupant → SCOPE decides its home.
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
import { PackBenchRefineFacet } from '@/components/packing/PackBenchRefineFacet';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import { useDashboardSearchController } from '@/hooks/useDashboardSearchController';
import { parseStaffParam } from '@/hooks/useStaffFilter';
import { unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';
import { fulfillmentLaneTotals } from '@/lib/unshipped-state';
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

/**
 * Band 1 — fixed lifecycle tabs + trailing CTAs. No Pin-list `leading` (honest
 * absence). Find / Views / inspector park live on {@link OutboundTriageBand}.
 */
export function OutboundWorkspaceHeader({
  orderView,
  onSelectView,
  className,
}: OutboundWorkspaceHeaderProps) {
  const active = isLifecycleView(orderView) ? orderView : 'unshipped';
  const searchParams = useSearchParams();
  const staffId = parseStaffParam(searchParams.get('staff')) ?? undefined;
  const { data: queueCounts } = useQuery(unshippedQueueCountsQuery({ staffId }));
  const { openIngestIndex } = useDashboardSearchController();

  // Lane totals come from the shared SoT so a tab number always equals the rows
  // that tab shows (Pending = PENDING + BLOCKED). See `fulfillmentLaneTotals`.
  const { pending: pendingCount, tested: testedCount } = fulfillmentLaneTotals(queueCounts);

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
      // Three pin scopes (never merge):
      //   WEBSITE-WIDE page-pin → GlobalHeader `HeaderPinsSwitcher`
      //   STATION Band-1 list-pin → omitted here (no closed outbound catalog)
      //   PAGE-WIDE Views → Band 3 `OutboundTriageBand` → `OutboundViewsMenu`
      // SoT: source-of-truth.md → Workbench Band-1 strip · SCOPE decides its home.
      tabs={tabs}
      activeTab={active}
      onTabChange={(id) => onSelectView(id as DashboardOrderView)}
      solidTone="accent"
      className={className}
      trailing={
        <WorkbenchTrailingCluster
          // Band 1 trailing is one Add — ingest methods live on the right rail.
          // No sort rail here — Priority / refine live on the inspector View cluster.
          divide={false}
          actions={<OutboundOrderChromeActions layout="ingest" onNewOrder={openIngestIndex} />}
        />
      }
    />
  );
}

/**
 * Band 3 — find (+ in-field bench refine) + Views (Bookmark; page-scoped inner
 * refinement) + far-right Show/Hide inspector. Sheet LAYOUT chrome (paint,
 * List|Drill, compare, ▦, KPI) stays on the pushing right inspector View
 * cluster; row-narrowing facets ride in the field. Never a Band-1 peer of
 * lifecycle tabs.
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

  // Bench placement is a pre-pack concern — Packed / Shipped lanes have left it.
  const showBenchFacet = isPrePackOrderView(active);

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
          trailingSuffix={showBenchFacet ? <PackBenchRefineFacet /> : undefined}
        />
      }
      views={<OutboundViewsMenu />}
      trailing={inspectorToggle}
    />
  );
}
