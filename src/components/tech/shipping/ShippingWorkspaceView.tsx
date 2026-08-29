'use client';

/**
 * Shipping mode Workbench on `/test` — Sheets flush chrome (Unbox recipe):
 * tabs · KPI · triage in one pinned sheet-chrome stack; body is
 * WORKBENCH_SHEET_HOST. Sidebar keeps Station scan / Up Next I/O.
 *
 * Multi-select opens the order right-rail plane (History / dashboard SoT) —
 * no bottom ContextualSelectionBar capsule.
 */

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { UnshippedTable } from '@/components/unshipped/UnshippedTable';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import { TechAllTriageTable } from '@/components/tech/all/TechAllTriageTable';
import { OrderRailCompare } from '@/components/dashboard/rail/OrderRailCompare';
import { OrderRailShell } from '@/components/dashboard/rail/OrderRailShell';
import { useOrderRailSelection } from '@/hooks/useOrderRailSelection';
import { useShippingWorkspaceTab } from '@/hooks/useShippingWorkspaceTab';
import { useNewOrderParam } from '@/hooks/useNewOrderParam';
import { NewOrderEntryOverlay } from '@/components/orders/NewOrderEntryOverlay';
import type { DataTableTabStrip } from '@/components/tables/TableStatusBar';

function TableFallback() {
  return <div className="min-h-[240px] flex-1 bg-surface-canvas" aria-hidden />;
}

const TechTable = dynamic(
  () => import('@/components/TechTable').then((m) => m.TechTable),
  // SSR allowed — shipping history is not `/test` LCP (Testing centre is).
  // Loading fallback is the stand-in while the chunk resolves.
  { loading: TableFallback },
);

export interface ShippingWorkspaceViewProps {
  /** Signed-in tech id — used as History fallback when staff filter is set to Me via URL. */
  techId: string;
}

export function ShippingWorkspaceView({ techId }: ShippingWorkspaceViewProps) {
  const { shipTab, setShipTab } = useShippingWorkspaceTab();
  const { newOpen, openNew, closeNew } = useNewOrderParam();
  const parsedTechId = parseInt(techId, 10);
  const queueTab = shipTab === 'pending' || shipTab === 'urgent';
  // Pending / Urgent reuse the dashboard To Ship selection scope + rail actions.
  const { selectionEnabled, selectMode, selectionOverlays } = useOrderRailSelection(
    'unshipped',
    { publish: queueTab },
  );

  const tabStrip: DataTableTabStrip = {
    tabs: [
      { id: 'pending', label: 'Pending' },
      { id: 'urgent', label: 'Urgent' },
      { id: 'all', label: 'All' },
      { id: 'history', label: 'History' },
    ],
    activeTab: shipTab,
    onTabChange: (id) => setShipTab(id as typeof shipTab),
  };

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
      <DashboardScrollShell className="h-full bg-transparent">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
              <Suspense fallback={<div className="min-h-[240px] bg-surface-canvas" aria-hidden />}>
                {shipTab === 'history' ? (
                  <TechTable
                    testedBy={Number.isFinite(parsedTechId) ? parsedTechId : 0}
                    staffScope="url-or-self"
                    tabStrip={tabStrip}
                  />
                ) : shipTab === 'all' ? (
                  <TechAllTriageTable scope="shipping" tabStrip={tabStrip} />
                ) : (
                  <UnshippedTable
                    strictSearchScope
                    selectMode={selectMode}
                    railSelection
                    tabStrip={tabStrip}
                  />
                )}
              </Suspense>
        </div>

        {queueTab && selectionEnabled ? (
          <>
            <OrderRailCompare />
            <OrderRailShell />
            {selectionOverlays}
          </>
        ) : null}
      </DashboardScrollShell>
      <NewOrderEntryOverlay open={newOpen} onClose={closeNew} />
    </div>
  );
}
