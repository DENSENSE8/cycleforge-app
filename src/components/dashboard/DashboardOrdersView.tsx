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

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { UnshippedTable } from '@/components/unshipped/UnshippedTable';
import { PackedOrdersTable } from '@/components/dashboard/PackedOrdersTable';
import { OutboundKpiStrip } from '@/components/dashboard/OutboundKpiStrip';
import {
  OutboundTriageBand,
  OutboundWorkspaceHeader,
} from '@/components/dashboard/OutboundWorkspaceHeader';
import {
  WorkbenchSheetView,
  type WorkbenchSheetChrome,
} from '@/components/dashboard/WorkbenchSheetView';
import { OrderRailCompare } from '@/components/dashboard/rail/OrderRailCompare';
import { OrderRailShell } from '@/components/dashboard/rail/OrderRailShell';
import { useRailActionSnapshot } from '@/components/dashboard/rail/OrderRailActions';
import { OrdersDrillHost } from '@/components/outbound/orders/OrdersDrillHost';
import { OrdersCompareHost } from '@/components/outbound/orders/OrdersCompareHost';
import { OrdersViewControlsRail } from '@/components/outbound/orders/OrdersViewControlsRail';
import { useOrdersViewChrome } from '@/components/outbound/orders/orders-view-chrome-context';
import { CsvImportStagingHost } from '@/components/outbound/orders/CsvImportStagingHost';
import {
  isPrePackOrderView,
  type DashboardOrderView,
} from '@/utils/dashboard-search-state';
import { parseOrdersDrillLayout, ORDERS_DRILL_LAYOUT_PARAM } from '@/lib/shipping/orders-drill-layout';
import {
  ORDERS_COMPARE_LAYOUT_PARAM,
  parseOrdersCompareLayout,
} from '@/lib/shipping/orders-compare-layout';
import { ORDER_IMPORT_DESCRIPTOR } from '@/lib/orders/order-import-descriptor';
import {
  clearTableImportDraft,
  useTableImportDraft,
} from '@/lib/tables/import/staging-store';
import { useTableImportParam } from '@/hooks/useTableImportParam';

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
  const csvDraft = useTableImportDraft(ORDER_IMPORT_DESCRIPTOR.surfaceId);
  // Paint-pending: the popover writes this from another tree, so the desk must
  // not wait on soft-replace to know staging owns the surface.
  const { active: importCsvActive, setActive: setImportCsvActive } =
    useTableImportParam(ORDER_IMPORT_DESCRIPTOR);
  const showCsvStaging = importCsvActive && Boolean(csvDraft);
  const showOutboundChrome =
    !showCsvStaging &&
    (isPrePackOrderView(orderView) || orderView === 'packed' || orderView === 'shipped');
  const { controlsEl, kpiOpen, onToggleKpi, setViewShellOpen } = useOrdersViewChrome();
  const { rows } = useRailActionSnapshot();

  /**
   * To-ship supplies its OWN chrome controller instead of the shell's local one:
   * its `controlsEl` + KPI collapse live in `useOrdersViewChrome` because the
   * View cluster sits on the pushing right inspector, not on Band 3
   * (`workbench-ops-queue.md` → To-ship three-band flush). `controlsSlotRef` is
   * `null` for the same reason — Band 3 hosts no controls here, so there is
   * nothing to portal into.
   */
  const sheetChrome: WorkbenchSheetChrome = useMemo(
    () => ({ controlsEl, controlsSlotRef: null, kpiOpen, toggleKpi: onToggleKpi }),
    [controlsEl, kpiOpen, onToggleKpi],
  );

  // Stale `?import=csv` after refresh (draft is session-only) — clear the flag.
  useEffect(() => {
    if (!importCsvActive || csvDraft) return;
    setImportCsvActive(false);
  }, [csvDraft, importCsvActive, setImportCsvActive]);

  // Leaving staging via URL (back) should drop the in-memory draft — but ONLY
  // once staging was genuinely open for THIS draft. The store publishes a new
  // draft synchronously while the flag is still catching up, and a bare
  // `!importCsvActive` test tore the draft down on that very frame, so the
  // surface could never open. Sync-guard, not paint-pending (`source-of-truth.md`
  // → Optimistic URL-param paint).
  const stagingWasOpen = useRef(false);
  useEffect(() => {
    if (!csvDraft) {
      stagingWasOpen.current = false;
      return;
    }
    if (importCsvActive) {
      stagingWasOpen.current = true;
      return;
    }
    if (!stagingWasOpen.current) return;
    stagingWasOpen.current = false;
    clearTableImportDraft(ORDER_IMPORT_DESCRIPTOR.surfaceId);
  }, [csvDraft, importCsvActive]);

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
    <WorkbenchSheetView
      chrome={sheetChrome}
      // CSV staging OWNS the surface: it replaces the three bands entirely
      // (there is no lifecycle to tab through mid-import), so the chrome slots
      // go undefined and the shell renders no chrome at all.
      tabs={
        showOutboundChrome
          ? ({ className }) => (
              <OutboundWorkspaceHeader
                orderView={orderView}
                onSelectView={onSelectView}
                className={className}
              />
            )
          : undefined
      }
      kpi={showOutboundChrome ? <OutboundKpiStrip mode={kpiMode} /> : undefined}
      // Band 3 is find-only here — no controls portal, no KPI toggle. Both live
      // on the inspector View cluster.
      triage={showOutboundChrome ? () => <OutboundTriageBand orderView={orderView} /> : undefined}
      sheetHostClassName={
        showOutboundChrome || showCsvStaging ? undefined : 'relative flex min-w-0 flex-col'
      }
      overlays={
        showCsvStaging ? null : selectionEnabled ? (
          <>
            <OrderRailCompare />
            <OrderRailShell />
            <OrdersViewControlsRail />
            {selectionOverlays}
          </>
        ) : (
          <OrdersViewControlsRail />
        )
      }
    >
      {/* The shell hands back the same `controlsEl` this surface supplied, so the
          body reads it directly from the context rather than shadowing it. */}
      {() =>
        showCsvStaging ? (
          <CsvImportStagingHost />
        ) : showCompare ? (
          <OrdersCompareHost selectMode={selectMode} columnTriggerPortalTarget={controlsEl} />
        ) : showDrill ? (
          <OrdersDrillHost selectMode={selectMode} columnTriggerPortalTarget={controlsEl} />
        ) : (
          listBody
        )
      }
    </WorkbenchSheetView>
  );
}
