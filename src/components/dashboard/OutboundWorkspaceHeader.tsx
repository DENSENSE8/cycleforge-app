'use client';

/**
 * Outbound workspace chrome — To-ship Sheets flush stack:
 *
 *   Band 1 — triage facets (All · Must ship · Urgent · OOS · Awaiting customer) + Add
 *   Band 2 — KPI (DashboardOrdersView)
 *   Band 3 — find · Views · Hide/Show metrics · Show/Hide inspector
 *
 * Lifecycle tabs (Pending · Tested · Packed · Shipped) were retired — stage is a
 * row fact on the in-warehouse list. Facets filter the same list.
 */

import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  TO_SHIP_TRIAGE_FACET_LABEL,
  applyToShipTriageFacet,
  getToShipTriageFacetFromSearch,
  isPrePackOrderView,
  type DashboardOrderView,
  type ToShipTriageFacet,
} from '@/utils/dashboard-search-state';
import {
  usePackedFindFieldChrome,
  useToShipFilterHotkeys,
} from '@/components/dashboard/OutboundFilterStrip';
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
import { WorkbenchKpiCollapseToggle } from '@/components/dashboard/workbench-kpi-collapse';

const TRIAGE_FACETS = [
  'all',
  'must_ship',
  'urgent',
  'blocked',
  'awaiting_customer',
] as const satisfies readonly ToShipTriageFacet[];

export interface OutboundWorkspaceHeaderProps {
  orderView: DashboardOrderView;
  onSelectView: (view: DashboardOrderView) => void;
  className?: string;
}

/**
 * Band 1 — triage facets + trailing Add. Find / Views / inspector on
 * {@link OutboundTriageBand}.
 */
export function OutboundWorkspaceHeader({
  onSelectView: _onSelectView,
  className,
}: OutboundWorkspaceHeaderProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const staffId = parseStaffParam(searchParams.get('staff')) ?? undefined;
  const { data: queueCounts } = useQuery(unshippedQueueCountsQuery({ staffId }));
  const { openIngestIndex } = useDashboardSearchController();
  const active = getToShipTriageFacetFromSearch(searchParams);

  const { pending: pendingCount, blocked: blockedCount } = fulfillmentLaneTotals(queueCounts);
  const urgentCount = queueCounts?.urgent ?? 0;
  const mustShipCount = queueCounts?.mustShip ?? 0;

  const tabs = useMemo(
    () =>
      TRIAGE_FACETS.map((id) => ({
        id,
        label: TO_SHIP_TRIAGE_FACET_LABEL[id],
        count:
          id === 'all'
            ? (queueCounts?.total ?? pendingCount)
            : id === 'must_ship'
              ? mustShipCount || undefined
              : id === 'urgent'
                ? urgentCount || undefined
                : id === 'blocked'
                  ? blockedCount || undefined
                  : undefined,
        color: (id === 'all'
          ? 'blue'
          : id === 'must_ship'
            ? 'red'
            : id === 'urgent'
              ? 'orange'
              : id === 'blocked'
                ? 'red'
                : 'gray') as 'blue' | 'red' | 'orange' | 'gray',
      })),
    [queueCounts?.total, pendingCount, mustShipCount, urgentCount, blockedCount],
  );

  const onTabChange = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams.toString());
      applyToShipTriageFacet(next, id as ToShipTriageFacet);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return (
    <WorkbenchChromeHeader
      density="band"
      tabs={tabs}
      activeTab={active}
      onTabChange={onTabChange}
      solidTone="accent"
      className={className}
      trailing={
        <WorkbenchTrailingCluster
          divide={false}
          actions={
            <OutboundOrderChromeActions
              layout="ingest"
              onNewOrder={openIngestIndex}
            />
          }
        />
      }
    />
  );
}

/**
 * Band 3 — find (+ in-field bench refine) + Views + Hide/Show metrics +
 * far-right Show/Hide inspector.
 */
function OutboundPackedFindBar({
  searchQuery,
  onSearchChange,
}: {
  searchQuery: string;
  onSearchChange: (next: string) => void;
}) {
  const packedFind = usePackedFindFieldChrome();
  return (
    <TechRailSearchBar
      variant="chrome"
      value={searchQuery}
      onChange={onSearchChange}
      placeholder="Filter orders…"
      className="min-w-0 flex-1"
      inlineContentKey={packedFind.inlineContentKey}
      trailingPrefix={packedFind.trailingPrefix}
    />
  );
}

export function OutboundTriageBand({
  orderView,
  className,
}: {
  orderView: DashboardOrderView;
  className?: string;
}) {
  const { searchQuery, setSearch } = useDashboardSearchController();
  const { viewShellOpen, setViewShellOpen, kpiOpen, onToggleKpi } =
    useOrdersViewChrome();
  const searchParams = useSearchParams();
  const { rows } = useRailActionSnapshot();
  const openOrderId = searchParams.get('openOrderId');
  const inspectorOpen =
    Boolean(openOrderId) || rows.length > 0 || viewShellOpen;

  useToShipFilterHotkeys(isPrePackOrderView(orderView));

  const openViewShell = useCallback(() => setViewShellOpen(true), [setViewShellOpen]);

  const inspectorToggle = (
    <WorkbenchInspectorToggle
      open={inspectorOpen}
      onOpenEmpty={openViewShell}
      testId="orders-inspector-toggle"
    />
  );

  // Bench placement is an in-warehouse concern.
  const showBenchFacet = isPrePackOrderView(orderView);
  const stageParam = String(searchParams.get('stage') || '').toLowerCase();
  const showPackedFind = stageParam === 'packed';

  return (
    <WorkbenchTriageBand
      className={className}
      search={
        showPackedFind ? (
          <OutboundPackedFindBar
            searchQuery={searchQuery}
            onSearchChange={setSearch}
          />
        ) : (
          <TechRailSearchBar
            variant="chrome"
            value={searchQuery}
            onChange={setSearch}
            placeholder="Filter orders…"
            className="min-w-0 flex-1"
            trailingSuffix={
              showBenchFacet ? <PackBenchRefineFacet /> : undefined
            }
          />
        )
      }
      views={<OutboundViewsMenu />}
      kpiToggle={
        <WorkbenchKpiCollapseToggle open={kpiOpen} onToggle={onToggleKpi} />
      }
      trailing={inspectorToggle}
    />
  );
}
