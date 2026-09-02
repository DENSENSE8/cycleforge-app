'use client';

/**
 * The dashboard's main orders region — the To-ship desk.
 *
 * There is no chrome here any more. The three-band stack, then the Sheets
 * toolbar that replaced it, were both deleted on 2026-08-29
 * (`docs/todo/one-table-sot-teardown-HANDOFF.md`): a page does not draw a
 * table's search box, its filters, its tabs or its counts — {@link DataTable}
 * does, from data the surface hands it. This component is now what a page host
 * should be: it picks the BODY (the queue, or the CSV import staging host) and
 * mounts the overlays that live beside it.
 *
 * The drill and compare hosts went with the teardown — they were second and
 * third table displays reachable from this one desk, which is the fork the
 * rebuild exists to end.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { UnshippedTable } from '@/components/unshipped/UnshippedTable';
import { OrderRailCompare } from '@/components/dashboard/rail/OrderRailCompare';
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
      selectMode={selectMode}
      railSelection
      onPrimaryPainted={onPrimaryPainted}
    />
  );

  const overlays = showCsvStaging ? null : selectionEnabled ? (
    <>
      <OrderRailCompare />
      <OrdersViewControlsRail />
      {selectionOverlays}
    </>
  ) : (
    <OrdersViewControlsRail />
  );

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {/*
        No status strip above the queue (operator ruling 2026-08-31). Open /
        Must ship / Shipped today rode here as a band between the desk chrome
        and the table; it was one more thing stacked above the first data row
        on a desk whose job is reading rows. Must-ship survives as a filter
        option in the table's own control, and Shipped today is the Shipped
        tab — neither capability was in this band alone.
      */}
      {body}
      {overlays}
      {stageOverlay}
    </div>
  );
}
