'use client';

/**
 * The dashboard's main orders region: outbound KPI strip + unified outbound
 * header (lifecycle slider · find-only triage) + the active list for the
 * current tab. Presentational — selection state + actions are owned by
 * useDashboardBulkSelection. Extracted from the dashboard page.
 *
 * Sheets flush chrome (Unbox History recipe): tabs · KPI · find-only triage
 * live in one pinned sheet-chrome stack; sheet refine / layout / KPI hide live
 * on the pushing right inspector View cluster. Body may be list,
 * OrdersDrillHost (`olayout=drill`), or OrdersCompareHost (`clayout=split|quad`).
 */

import { Suspense, useEffect, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { UnshippedTable } from '@/components/unshipped/UnshippedTable';
import { PackedOrdersTable } from '@/components/dashboard/PackedOrdersTable';
import { OutboundKpiStrip } from '@/components/dashboard/OutboundKpiStrip';
import {
  OutboundTriageBand,
  OutboundWorkspaceHeader,
} from '@/components/dashboard/OutboundWorkspaceHeader';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import {
  WORKBENCH_SHEET_CHROME,
  WORKBENCH_SHEET_HOST,
} from '@/components/dashboard/workbench-shell';
import { WorkbenchKpiBand } from '@/components/dashboard/workbench-kpi-collapse';
import { OrderRailCompare } from '@/components/dashboard/rail/OrderRailCompare';
import { OrderRailShell } from '@/components/dashboard/rail/OrderRailShell';
import { useRailActionSnapshot } from '@/components/dashboard/rail/OrderRailActions';
import { OrdersDrillHost } from '@/components/outbound/orders/OrdersDrillHost';
import { OrdersCompareHost } from '@/components/outbound/orders/OrdersCompareHost';
import { OrdersViewControlsRail } from '@/components/outbound/orders/OrdersViewControlsRail';
import { useOrdersViewChrome } from '@/components/outbound/orders/orders-view-chrome-context';
import {
  isPrePackOrderView,
  type DashboardOrderView,
} from '@/utils/dashboard-search-state';
import { parseOrdersDrillLayout, ORDERS_DRILL_LAYOUT_PARAM } from '@/lib/shipping/orders-drill-layout';
import {
  ORDERS_COMPARE_LAYOUT_PARAM,
  parseOrdersCompareLayout,
} from '@/lib/shipping/orders-compare-layout';
import { cn } from '@/utils/_cn';

function TableFallback() {
  return <div className="flex-1 bg-surface-canvas" aria-hidden />;
}
// Shipped tab — allow SSR so it can share the desk paint path; loading
// fallback is the stand-in while the chunk resolves (not ssr:false — that
// would gate LCP if Shipped were the landing tab).
const DashboardShippedTable = dynamic(
  () => import('@/components/shipped').then((m) => m.DashboardShippedTable),
  { loading: TableFallback },
);

interface DashboardOrdersViewProps {
  orderView: DashboardOrderView;
  /** Switch the lifecycle tab (Pending · Tested · Packed · Shipped) — writes the URL view flag. */
  onSelectView: (view: DashboardOrderView) => void;
  selectMode: boolean;
  selectionEnabled: boolean;
  /** Modal surfaces the bulk actions open (assignment carousel, ship-by picker). */
  selectionOverlays?: ReactNode;
  /** Primary queue has paintable rows (for SSR stand-in handoff). */
  onPrimaryPainted?: () => void;
}

export function DashboardOrdersView({
  orderView,
  onSelectView,
  selectMode,
  selectionEnabled,
  selectionOverlays,
  onPrimaryPainted,
}: DashboardOrdersViewProps) {
  const searchParams = useSearchParams();
  const showOutboundChrome =
    isPrePackOrderView(orderView) || orderView === 'packed' || orderView === 'shipped';
  const { controlsEl, kpiOpen, onToggleKpi, setViewShellOpen } = useOrdersViewChrome();
  const { rows } = useRailActionSnapshot();

  // Order / batch occupant outranks the View-only shell.
  useEffect(() => {
    if (searchParams.get('openOrderId') || rows.length > 0) {
      setViewShellOpen(false);
    }
  }, [searchParams, rows.length, setViewShellOpen]);

  // Packed / Shipped tabs own their own tables — release the Unshipped stand-in.
  useEffect(() => {
    if (orderView === 'packed' || orderView === 'shipped') {
      onPrimaryPainted?.();
    }
  }, [orderView, onPrimaryPainted]);

  const drillLayout = parseOrdersDrillLayout(
    searchParams.get(ORDERS_DRILL_LAYOUT_PARAM),
  );
  const compareLayout = parseOrdersCompareLayout(
    searchParams.get(ORDERS_COMPARE_LAYOUT_PARAM),
  );
  // Compare multi wins over drill when both somehow set (chrome clears the other).
  const showCompare = compareLayout !== 'single';
  const showDrill = !showCompare && drillLayout === 'drill';

  const kpiMode =
    orderView === 'packed' || orderView === 'shipped'
      ? 'shipped'
      : orderView === 'tested'
        ? 'tested'
        : 'unshipped';

  const listBody =
    orderView === 'shipped' ? (
      <DashboardShippedTable
        selectMode={selectMode}
        railSelection
        toolbarPortalTarget={controlsEl}
      />
    ) : orderView === 'packed' ? (
      <PackedOrdersTable
        selectMode={selectMode}
        railSelection
        toolbarPortalTarget={controlsEl}
      />
    ) : (
      <UnshippedTable
        strictSearchScope
        selectMode={selectMode}
        railSelection
        toolbarPortalTarget={controlsEl}
        fulfillmentLane={orderView === 'tested' ? 'tested' : 'pending'}
        onPrimaryPainted={onPrimaryPainted}
      />
    );

  return (
    <DashboardScrollShell
      chrome={
        showOutboundChrome ? (
          <div className={cn(WORKBENCH_SHEET_CHROME, 'flex flex-col gap-0')}>
            <OutboundWorkspaceHeader
              orderView={orderView}
              onSelectView={onSelectView}
              className="border-l-0 border-t-0 shadow-sm"
            />
            <WorkbenchKpiBand
              open={kpiOpen}
              onSnapCollapse={() => {
                if (kpiOpen) onToggleKpi();
              }}
              onSnapExpand={() => {
                if (!kpiOpen) onToggleKpi();
              }}
            >
              <OutboundKpiStrip mode={kpiMode} />
            </WorkbenchKpiBand>
            <OutboundTriageBand orderView={orderView} />
          </div>
        ) : undefined
      }
    >
      <div className={showOutboundChrome ? WORKBENCH_SHEET_HOST : 'relative flex min-w-0 flex-col'}>
        <Suspense fallback={<div className="min-h-[240px] bg-surface-canvas" aria-hidden />}>
          {showCompare ? (
            <OrdersCompareHost
              selectMode={selectMode}
              columnTriggerPortalTarget={controlsEl}
            />
          ) : showDrill ? (
            <OrdersDrillHost
              selectMode={selectMode}
              columnTriggerPortalTarget={controlsEl}
            />
          ) : (
            listBody
          )}
        </Suspense>
      </div>

      {selectionEnabled ? (
        <>
          <OrderRailCompare />
          <OrderRailShell />
          <OrdersViewControlsRail />
          {selectionOverlays}
        </>
      ) : (
        <OrdersViewControlsRail />
      )}
    </DashboardScrollShell>
  );
}
