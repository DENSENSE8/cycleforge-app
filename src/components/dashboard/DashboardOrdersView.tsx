'use client';

/** The dashboard's main orders region — the To-ship desk. */

import { useEffect, useRef, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { UnshippedTable } from '@/components/unshipped/UnshippedTable';
import { OrdersViewControlsRail } from '@/components/outbound/orders/OrdersViewControlsRail';
import { useOrdersViewChrome } from '@/components/outbound/orders/orders-view-chrome-context';
import { useRailActionSnapshot } from '@/components/dashboard/rail/OrderRailActions';
import { CsvImportStagingHost } from '@/components/outbound/orders/CsvImportStagingHost';
import { type DashboardOrderView } from '@/utils/dashboard-search-state';
import { ORDER_IMPORT_DESCRIPTOR } from '@/lib/orders/order-import-descriptor';
import {
  clearTableImportDraft,
  useTableImportDraft,
} from '@/lib/tables/import/staging-store';
import { useTableImportParam } from '@/hooks/useTableImportParam';
import { OrderSyncRunView } from '@/features/orders/sync/OrderSyncRunView';
import { useOrdersSyncRunOptional } from '@/features/orders/sync/orders-sync-run-context';
import {
  ORDERS_DESK_CONTEXT_KEY,
  ORDERS_DESK_SUPPORT_CONTEXT,
  parseOrdersDeskContext,
} from '@/lib/shipping/orders-desk';

interface DashboardOrdersViewProps {
  orderView: DashboardOrderView;
  /** Kept for callers; the desk is one in-warehouse list (facets own refine). */
  onSelectView: (view: DashboardOrderView) => void;
  selectMode: boolean;
  selectionEnabled: boolean;
  /** Modal surfaces the bulk actions open (assignment carousel, ship-by picker). */
  selectionOverlays?: ReactNode;
  /** Center Lock L2 — order record plane stacked on the table stage. */
  stageOverlay?: ReactNode;
  /** Primary queue has paintable rows (for SSR stand-in handoff). */
  onPrimaryPainted?: () => void;
}

export function DashboardOrdersView({
  selectMode,
  selectionEnabled,
  selectionOverlays,
  stageOverlay,
  onPrimaryPainted,
}: DashboardOrdersViewProps) {
  const searchParams = useSearchParams();
  const csvDraft = useTableImportDraft(ORDER_IMPORT_DESCRIPTOR.surfaceId);
  const { active: importCsvActive, setActive: setImportCsvActive } =
    useTableImportParam(ORDER_IMPORT_DESCRIPTOR);
  const showCsvStaging = importCsvActive && Boolean(csvDraft);
  const { setViewShellOpen } = useOrdersViewChrome();
  const { rows } = useRailActionSnapshot();
  const isSupportContext =
    parseOrdersDeskContext(searchParams.get(ORDERS_DESK_CONTEXT_KEY)) ===
    ORDERS_DESK_SUPPORT_CONTEXT;

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

  /**
   * A sync TAKES THE STAGE (operator 2026-09-15).
   * A sync TAKES THE STAGE (operator 2026-09-15). Same seam the CSV staging
   */
  const syncRun = useOrdersSyncRunOptional();
  const showSyncRun = Boolean(syncRun?.run);

  const body = showSyncRun && syncRun?.run ? (
    <OrderSyncRunView
      run={syncRun.run}
      elapsedMs={syncRun.elapsedMs}
      isRunning={syncRun.isRunning}
      onCancel={syncRun.cancel}
      onDismiss={syncRun.dismiss}
      outcome={syncRun.outcome}
      detail={syncRun.detail}
      demo={syncRun.demo}
    />
  ) : showCsvStaging ? (
    <CsvImportStagingHost />
  ) : (
    <UnshippedTable
      strictSearchScope
      selectMode={selectMode}
      railSelection
      onPrimaryPainted={onPrimaryPainted}
      // To ship paints the industrial record ledger (BRIEF §11, first slice).
      // Support › Inquiries aliases this desk and keeps the slot table.
      ledger={!isSupportContext}
    />
  );

  const overlays = showSyncRun || showCsvStaging ? null : selectionEnabled ? (
    <>
      <OrdersViewControlsRail />
      {selectionOverlays}
    </>
  ) : (
    <OrdersViewControlsRail />
  );

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {/*
 * No status strip above the queue (operator ruling 2026-08-31).
 * No status strip above the queue (operator ruling 2026-08-31). Open /
 */}
      {body}
      {overlays}
      {stageOverlay}
    </div>
  );
}
