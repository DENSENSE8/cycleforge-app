'use client';

/**
 * Pack browse workbench — Queue (TESTED Unshipped SoT) · History (packer logs).
 *
 * The desk draws no chrome. It resolves which BODY the `?packView=` mode wants
 * and hands that body the tab strip as data; the table draws the strip on its
 * own status bar. The pinned Sheets stack that used to sit above the grid went
 * with the display layer on 2026-08-29.
 *
 * Multi-select opens the order right-rail plane (History / dashboard SoT) —
 * no bottom ContextualSelectionBar capsule.
 */

import { Suspense } from 'react';
import { UnshippedTable } from '@/components/unshipped/UnshippedTable';
import { PackerTable } from '@/components/PackerTable';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import { OrderRailCompare } from '@/components/dashboard/rail/OrderRailCompare';
import { OrderRailShell } from '@/components/dashboard/rail/OrderRailShell';
import { useOrderRailSelection } from '@/hooks/useOrderRailSelection';
import { usePackWorkspaceTab } from '@/hooks/usePackWorkspaceTab';
import { useNewOrderParam } from '@/hooks/useNewOrderParam';
import { NewOrderEntryOverlay } from '@/components/orders/NewOrderEntryOverlay';
import { dispatchPackActiveOrder } from '@/components/packer/usePackerOrderPane';
import { shippedOrderToPackPane } from '@/components/packer/shipped-order-to-pack-pane';
import type { ShippedOrder } from '@/types/orders';
import type { DataTableTabStrip } from '@/components/tables/TableStatusBar';

function TableFallback() {
  return <div className="min-h-[240px] flex-1 bg-surface-canvas" aria-hidden />;
}

/** The desk's modes. Each one mounts a different body over the same bench. */
const PACK_TABS = [
  { id: 'queue', label: 'Queue' },
  { id: 'history', label: 'History' },
];

export function PackWorkspaceView({ packerId }: { packerId: number }) {
  const { packView, setPackView } = usePackWorkspaceTab();
  const { newOpen, closeNew } = useNewOrderParam();
  const queueActive = packView === 'queue';
  const { selectionEnabled, selectMode, selectionOverlays } = useOrderRailSelection(
    'unshipped',
    { publish: queueActive },
  );

  const handleOpenQueueRecord = (record: ShippedOrder) => {
    dispatchPackActiveOrder(shippedOrderToPackPane(record));
  };

  const tabStrip: DataTableTabStrip = {
    tabs: PACK_TABS,
    activeTab: packView,
    onTabChange: (id) => setPackView(id as typeof packView),
  };

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
      <DashboardScrollShell className="h-full bg-transparent">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <Suspense fallback={<TableFallback />}>
            {packView === 'history' ? (
              <PackerTable
                packedBy={Number.isFinite(packerId) ? packerId : 0}
                tabStrip={tabStrip}
              />
            ) : (
              <UnshippedTable
                strictSearchScope
                selectMode={selectMode}
                railSelection
                tabStrip={tabStrip}
                onOpenRecord={handleOpenQueueRecord}
                searchEmptyTitle="No ready-to-pack orders"
                searchResultLabel="orders ready to pack"
                clearSearchLabel="Show all ready-to-pack"
              />
            )}
          </Suspense>
        </div>

        {queueActive && selectionEnabled ? (
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
