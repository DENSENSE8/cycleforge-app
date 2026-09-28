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
import {
  ORDERS_DESK_CONTEXT_KEY,
  ORDERS_DESK_SUPPORT_CONTEXT,
  parseOrdersDeskContext,
} from '@/lib/shipping/orders-desk';

interface DashboardOrdersViewProps {
  orderView: DashboardOrderView;
  /** Kept for callers; the desk is one in-warehouse list (facets own refine). */
  onSelectView: (view: DashboardOrderView) => void;
  selectionEnabled: boolean;
  /** Modal surfaces the bulk actions open (assignment carousel, ship-by picker). */
  selectionOverlays?: ReactNode;
  /** Primary queue has paintable rows (for SSR stand-in handoff). */
  onPrimaryPainted?: () => void;
}

export function DashboardOrdersView({
  selectionEnabled,
  selectionOverlays,
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

  const body = showCsvStaging ? (
    <CsvImportStagingHost />
  ) : (
    <UnshippedTable
      strictSearchScope
      railSelection
      onPrimaryPainted={onPrimaryPainted}
      // To ship paints the order card list in In place and Split; the
      // industrial ledger is its FLOOR face (⌘/Ctrl+Shift+F, owner 2026-09-26).
      // Support › Inquiries aliases this desk: cards only.
      floor={!isSupportContext}
    />
  );

  const overlays = showCsvStaging ? null : selectionEnabled ? (
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
    </div>
  );
}
