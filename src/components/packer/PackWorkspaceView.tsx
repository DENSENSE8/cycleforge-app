'use client';

/**
 * Pack browse workbench — Queue (TESTED Unshipped SoT) · History (packer logs).
 * Mirrors ShippingWorkspaceView / UnboxWorkspaceView.
 */

import { Suspense, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { UnshippedTable } from '@/components/unshipped/UnshippedTable';
import { PackerTable } from '@/components/PackerTable';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import { PackKpiStrip } from '@/components/packer/PackKpiStrip';
import { PackWorkspaceHeader } from '@/components/packer/PackWorkspaceHeader';
import {
  WORKBENCH_BODY_COLUMN,
  WORKBENCH_CHROME_COLUMN,
} from '@/components/dashboard/workbench-shell';
import { ContextualSelectionBar } from '@/design-system/components/ContextualSelectionBar';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import { useDashboardBulkSelection } from '@/hooks/useDashboardBulkSelection';
import { usePackWorkspaceTab } from '@/hooks/usePackWorkspaceTab';
import { useNewOrderParam } from '@/hooks/useNewOrderParam';
import { NewOrderEntryOverlay } from '@/components/orders/NewOrderEntryOverlay';
import { dispatchPackActiveOrder } from '@/components/packer/usePackerOrderPane';
import { shippedOrderToPackPane } from '@/components/packer/shipped-order-to-pack-pane';
import type { ShippedOrder } from '@/types/orders';

function TableFallback() {
  return <div className="min-h-[240px] flex-1 bg-surface-canvas" aria-hidden />;
}

export function PackWorkspaceView({ packerId }: { packerId: number }) {
  const { packView, setPackView } = usePackWorkspaceTab();
  const { newOpen, openNew, closeNew } = useNewOrderParam();
  const [controlsEl, setControlsEl] = useState<HTMLDivElement | null>(null);
  const { selectMode, selectedRows, selectionActions } =
    useDashboardBulkSelection('unshipped');

  const paneMotionProps = {
    ...useMotionPresence(framerPresence.workbenchPane),
    transition: useMotionTransition(framerTransition.workbenchPaneMount),
  };

  const handleOpenQueueRecord = (record: ShippedOrder) => {
    dispatchPackActiveOrder(shippedOrderToPackPane(record));
  };

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden">
    <DashboardScrollShell
      className="h-full bg-transparent"
      chrome={
        <div className={WORKBENCH_CHROME_COLUMN}>
          <PackWorkspaceHeader
            tab={packView}
            onSelectTab={setPackView}
            controlsSlotRef={setControlsEl}
            onNewOrder={openNew}
          />
        </div>
      }
    >
      <div className={WORKBENCH_BODY_COLUMN}>
        <div className="mb-4">
          <PackKpiStrip mode={packView} packerId={packerId} />
        </div>

        <div className="relative flex min-w-0 flex-col">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={packView} {...paneMotionProps} className="flex min-w-0 flex-col">
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
      </div>

      {packView === 'queue' ? (
        <ContextualSelectionBar
          scope={DASHBOARD_ORDERS_SELECTION_SCOPE}
          rows={selectedRows}
          actions={selectionActions}
          pinToViewport
        />
      ) : null}
    </DashboardScrollShell>
    <NewOrderEntryOverlay open={newOpen} onClose={closeNew} />
    </div>
  );
}
