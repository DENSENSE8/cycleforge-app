'use client';

/**
 * Pack browse workbench — Queue (TESTED Unshipped SoT) · History (packer logs).
 * Sheets flush chrome (Unbox recipe): tabs · KPI · triage in one pinned
 * sheet-chrome stack; body is WORKBENCH_SHEET_HOST. Band 2 uses Unbox SoT
 *
 * Multi-select opens the order right-rail plane (History / dashboard SoT) —
 * no bottom ContextualSelectionBar capsule.
 */

import { Suspense, useState } from 'react';
import { AnimatePresence, motion, motionRole, useMotionRole } from '@/design-system/motion';
import { UnshippedTable } from '@/components/unshipped/UnshippedTable';
import { PackerTable } from '@/components/PackerTable';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import {
  PackTriageBand,
  PackWorkspaceHeader,
} from '@/components/packer/PackWorkspaceHeader';
import {
  WORKBENCH_SHEET_CHROME,
  WORKBENCH_SHEET_HOST,
} from '@/components/dashboard/workbench-shell';
import { OrderRailCompare } from '@/components/dashboard/rail/OrderRailCompare';
import { OrderRailShell } from '@/components/dashboard/rail/OrderRailShell';
import { useOrderRailSelection } from '@/hooks/useOrderRailSelection';
import { usePackWorkspaceTab } from '@/hooks/usePackWorkspaceTab';
import { useNewOrderParam } from '@/hooks/useNewOrderParam';
import { NewOrderEntryOverlay } from '@/components/orders/NewOrderEntryOverlay';
import { dispatchPackActiveOrder } from '@/components/packer/usePackerOrderPane';
import { shippedOrderToPackPane } from '@/components/packer/shipped-order-to-pack-pane';
import type { ShippedOrder } from '@/types/orders';
import { StationDeck } from '@/components/station/StationDeck';
import { PackHistoryDock } from '@/components/station/PackHistoryDock';
import { cn } from '@/utils/_cn';

function TableFallback() {
  return <div className="min-h-[240px] flex-1 bg-surface-canvas" aria-hidden />;
}

export function PackWorkspaceView({ packerId }: { packerId: number }) {
  const { packView, setPackView } = usePackWorkspaceTab();
  const { newOpen, openNew, closeNew } = useNewOrderParam();
  const [controlsEl, setControlsEl] = useState<HTMLDivElement | null>(null);
  const queueActive = packView === 'queue';
  const { selectionEnabled, selectMode, selectionOverlays } = useOrderRailSelection(
    'unshipped',
    { publish: queueActive },
  );

  const { presence, transition } = useMotionRole(motionRole.swap.focus);
  const paneMotionProps = { ...presence, transition };

  const handleOpenQueueRecord = (record: ShippedOrder) => {
    dispatchPackActiveOrder(shippedOrderToPackPane(record));
  };

  return (
    // This week's packs, leftmost and always on screen — the bench's own answer
    // to "did that pack land?". See `StationHistoryDock`.
    <StationDeck history={<PackHistoryDock packerId={packerId} />}>
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
      <DashboardScrollShell
        className="h-full bg-transparent"
        chrome={
          <div className={cn(WORKBENCH_SHEET_CHROME, 'flex flex-col gap-0')}>
            <PackWorkspaceHeader
              tab={packView}
              onSelectTab={setPackView}
              onNewOrder={openNew}
              className="rounded-none border-l-0 border-t-0 shadow-sm"
            />
            <PackTriageBand
              tab={packView}
              controlsSlotRef={setControlsEl}
            />
          </div>
        }
      >
        <div className={WORKBENCH_SHEET_HOST}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={packView}
              {...paneMotionProps}
              className="flex min-h-0 min-w-0 flex-1 flex-col"
            >
              <Suspense fallback={<TableFallback />}>
                {packView === 'history' ? (
                  <PackerTable
                    packedBy={Number.isFinite(packerId) ? packerId : 0}
                    toolbarPortalTarget={controlsEl}
                  />
                ) : (
                  <UnshippedTable
                    strictSearchScope
                    selectMode={selectMode}
                    railSelection
                    toolbarPortalTarget={controlsEl}
                    onOpenRecord={handleOpenQueueRecord}
                    searchEmptyTitle="No ready-to-pack orders"
                    searchResultLabel="orders ready to pack"
                    clearSearchLabel="Show all ready-to-pack"
                  />
                )}
              </Suspense>
            </motion.div>
          </AnimatePresence>
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
    </StationDeck>
  );
}
