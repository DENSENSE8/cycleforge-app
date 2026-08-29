'use client';

/**
 * The dashboard's main orders region — the To-ship sheet.
 *
 * Ported to the Sheets shell 2026-08-29 (`docs/todo/one-sheet-table-sot-PLAN.md`
 * Phase 1). The three-band stack (tabs · KPI · triage) is gone: one toolbar row
 * above the grid, one tab + status strip below it. Chrome composition lives in
 * {@link useOutboundSheetChrome}; the body may be the list, `OrdersDrillHost`,
 * `OrdersCompareHost`, or the CSV import staging host.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { UnshippedTable } from '@/components/unshipped/UnshippedTable';
import { SheetView } from '@/components/sheet/SheetView';
import { useOutboundSheetChrome } from '@/components/dashboard/useOutboundSheetChrome';
import { OutboundViewsMenu } from '@/components/dashboard/OutboundViewsMenu';
import { WorkbenchInspectorToggle } from '@/components/dashboard/workbench-inspector-toggle';
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
import { ORDERS_QUEUE_COLUMNS } from '@/lib/dashboard-order-row-layout';
import type { SheetFormatColumn } from '@/components/sheet/useSheetFormat';
import { useDashboardSearchController } from '@/hooks/useDashboardSearchController';

/**
 * Columns an operator may paint on To-ship.
 *
 * The gutters are excluded on purpose: `select` is a checkbox and `_fill` is
 * slack — neither has text for bold to act on, and offering them would be a
 * picker entry that does nothing. Every remaining track is labelled, so the
 * picker reads as the column names an operator already sees in the header.
 */
const TO_SHIP_FORMAT_COLUMNS: readonly SheetFormatColumn[] = ORDERS_QUEUE_COLUMNS
  .filter((c) => Boolean(c.label) && c.key !== 'select')
  .map((c) => ({ key: c.key, label: c.label as string }));

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
  const { controlsEl, setViewShellOpen, viewShellOpen } = useOrdersViewChrome();
  const { rows } = useRailActionSnapshot();
  const chrome = useOutboundSheetChrome(orderView);
  const { openIngestIndex } = useDashboardSearchController();

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

  const openOrderId = searchParams.get('openOrderId');
  const inspectorOpen = Boolean(openOrderId) || rows.length > 0 || viewShellOpen;

  const body = showCsvStaging ? (
    <CsvImportStagingHost />
  ) : showCompare ? (
    <OrdersCompareHost selectMode={selectMode} columnTriggerPortalTarget={controlsEl} />
  ) : showDrill ? (
    <OrdersDrillHost selectMode={selectMode} columnTriggerPortalTarget={controlsEl} />
  ) : (
    <UnshippedTable
      strictSearchScope
      selectMode={selectMode}
      railSelection
      toolbarPortalTarget={controlsEl}
      onPrimaryPainted={onPrimaryPainted}
    />
  );

  const overlays = showCsvStaging ? null : selectionEnabled ? (
    <>
      <OrderRailCompare />
      <OrderRailShell />
      <OrdersViewControlsRail />
      {selectionOverlays}
    </>
  ) : (
    <OrdersViewControlsRail />
  );

  return (
    <SheetView
      tableId="orders"
      toolbar={{
        searchSlot: chrome.searchSlot,
        // The import staging host IS the sheet while it is open — refining or
        // formatting a draft the operator is about to accept or discard would
        // act on rows that do not exist yet.
        filters: showOutboundChrome ? chrome.filters : undefined,
        capabilities: { format: showOutboundChrome, data: showOutboundChrome },
        // Import opens the ingest index (manual · platform · file · sync ·
        // backfill) — the same rail the retired Band-1 `Add` opened. Add itself
        // is gone from every desk; the global header owns creation now.
        onImport: showOutboundChrome ? openIngestIndex : undefined,
        viewActions: showOutboundChrome ? (
          <>
            <OutboundViewsMenu />
            <WorkbenchInspectorToggle
              open={inspectorOpen}
              onOpenEmpty={() => setViewShellOpen(true)}
              testId="orders-inspector-toggle"
            />
          </>
        ) : undefined,
      }}
      bottomBar={showOutboundChrome ? chrome.bottomBar : undefined}
      formatColumns={showOutboundChrome ? TO_SHIP_FORMAT_COLUMNS : undefined}
      overlays={overlays}
    >
      {body}
    </SheetView>
  );
}
