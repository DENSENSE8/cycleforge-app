'use client';

/**
 * The dashboard's main orders region: outbound KPI strip + unified outbound
 * header (triage facets · find triage) + the in-warehouse list.
 *
 * Sheets flush chrome: tabs · KPI · find triage live in one pinned sheet-chrome
 * stack; sheet refine / layout / KPI hide live on the pushing right inspector
 * View cluster. Body may be list, OrdersDrillHost, or OrdersCompareHost.
 */

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { UnshippedTable } from '@/components/unshipped/UnshippedTable';
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
import { type DashboardOrderView } from '@/utils/dashboard-search-state';
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

interface DashboardOrdersViewProps {
  orderView: DashboardOrderView;
  /** Kept for callers; the desk is one in-warehouse list (facets own refine). */
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
  const { active: importCsvActive, setActive: setImportCsvActive } =
    useTableImportParam(ORDER_IMPORT_DESCRIPTOR);
  const showCsvStaging = importCsvActive && Boolean(csvDraft);
  const showOutboundChrome = !showCsvStaging;
  const { controlsEl, kpiOpen, onToggleKpi, setViewShellOpen } = useOrdersViewChrome();
  const { rows } = useRailActionSnapshot();

  const sheetChrome: WorkbenchSheetChrome = useMemo(
    () => ({ controlsEl, controlsSlotRef: null, kpiOpen, toggleKpi: onToggleKpi }),
    [controlsEl, kpiOpen, onToggleKpi],
  );

  useEffect(() => {
    if (!importCsvActive || csvDraft) return;
    setImportCsvActive(false);
  }, [csvDraft, importCsvActive, setImportCsvActive]);

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

  useEffect(() => {
    if (searchParams.get('openOrderId') || rows.length > 0) {
      setViewShellOpen(false);
    }
  }, [searchParams, rows.length, setViewShellOpen]);

  const drillLayout = parseOrdersDrillLayout(
    searchParams.get(ORDERS_DRILL_LAYOUT_PARAM),
  );
  const compareLayout = parseOrdersCompareLayout(
    searchParams.get(ORDERS_COMPARE_LAYOUT_PARAM),
  );
  const showCompare = compareLayout !== 'single';
  const showDrill = !showCompare && drillLayout === 'drill';

  const listBody = (
    <UnshippedTable
      strictSearchScope
      selectMode={selectMode}
      railSelection
      toolbarPortalTarget={controlsEl}
      onPrimaryPainted={onPrimaryPainted}
    />
  );

  return (
    <WorkbenchSheetView
      chrome={sheetChrome}
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
      kpi={showOutboundChrome ? <OutboundKpiStrip mode="unshipped" /> : undefined}
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
