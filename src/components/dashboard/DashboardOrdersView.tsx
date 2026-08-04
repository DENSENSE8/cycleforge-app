'use client';

/**
 * The dashboard's main orders region: outbound KPI strip + unified outbound
 * header (lifecycle slider · contextual filters/controls) + the active list for
 * the current tab. Presentational — selection state + actions are owned by
 * useDashboardBulkSelection. Extracted from the dashboard page.
 *
 * Sheets flush chrome (Unbox recipe): tabs · KPI · triage live in one pinned
 * sheet-chrome stack; the grid body is the flush sheet host — no side
 * gutters. Body may be list, OrdersDrillHost (`olayout=drill`), or
 * OrdersCompareHost (`clayout=split|quad`).
 */

import { Suspense, useState, type ReactNode } from 'react';
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
import { OrderRailCompare } from '@/components/dashboard/rail/OrderRailCompare';
import { OrderRailShell } from '@/components/dashboard/rail/OrderRailShell';
import { OrdersDrillHost } from '@/components/outbound/orders/OrdersDrillHost';
import { OrdersCompareHost } from '@/components/outbound/orders/OrdersCompareHost';
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
const DashboardShippedTable = dynamic(
  () => import('@/components/shipped').then((m) => m.DashboardShippedTable),
  { ssr: false, loading: TableFallback },
);

interface DashboardOrdersViewProps {
  orderView: DashboardOrderView;
  /** Switch the lifecycle tab (Pending · Tested · Packed · Shipped) — writes the URL view flag. */
  onSelectView: (view: DashboardOrderView) => void;
  selectMode: boolean;
  selectionEnabled: boolean;
  /** Modal surfaces the bulk actions open (assignment carousel, ship-by picker). */
  selectionOverlays?: ReactNode;
}

export function DashboardOrdersView({
  orderView,
  onSelectView,
  selectMode,
  selectionEnabled,
  selectionOverlays,
}: DashboardOrdersViewProps) {
  const searchParams = useSearchParams();
  const showOutboundChrome =
    isPrePackOrderView(orderView) || orderView === 'packed' || orderView === 'shipped';
  const [outboundControlsEl, setOutboundControlsEl] = useState<HTMLDivElement | null>(null);

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
        toolbarPortalTarget={outboundControlsEl}
      />
    ) : orderView === 'packed' ? (
      <PackedOrdersTable
        selectMode={selectMode}
        railSelection
        toolbarPortalTarget={outboundControlsEl}
      />
    ) : (
      <UnshippedTable
        strictSearchScope
        selectMode={selectMode}
        railSelection
        toolbarPortalTarget={outboundControlsEl}
        fulfillmentLane={orderView === 'tested' ? 'tested' : 'pending'}
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
              className="rounded-none border-l-0 border-t-0 shadow-sm"
            />
            <div className="border-b border-r border-border-soft bg-surface-card px-3 py-2">
              <OutboundKpiStrip mode={kpiMode} />
            </div>
            <OutboundTriageBand
              orderView={orderView}
              controlsSlotRef={setOutboundControlsEl}
            />
          </div>
        ) : undefined
      }
    >
      <div className={showOutboundChrome ? WORKBENCH_SHEET_HOST : 'relative flex min-w-0 flex-col'}>
        <Suspense fallback={<div className="min-h-[240px] bg-surface-canvas" aria-hidden />}>
          {showCompare ? (
            <OrdersCompareHost selectMode={selectMode} />
          ) : showDrill ? (
            <OrdersDrillHost selectMode={selectMode} />
          ) : (
            listBody
          )}
        </Suspense>
      </div>

      {selectionEnabled ? (
        <>
          <OrderRailCompare />
          <OrderRailShell />
          {selectionOverlays}
        </>
      ) : null}
    </DashboardScrollShell>
  );
}
