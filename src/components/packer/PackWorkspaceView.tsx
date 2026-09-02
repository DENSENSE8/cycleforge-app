'use client';

/**
 * Pack browse workbench — Queue (TESTED Unshipped SoT) · History (packer logs).
 * Sheets flush chrome (Unbox recipe): tabs · KPI · triage in one pinned
 * sheet-chrome stack; body is 'relative flex min-h-0 min-w-0 flex-1 flex-col'. Band 2 uses Unbox SoT
 *
 * Multi-select opens the order right-rail plane (History / dashboard SoT) —
 * no bottom ContextualSelectionBar capsule.
 */

import { Suspense } from 'react';
import { AnimatePresence, motion, motionRole, useMotionRole } from '@/design-system/motion';
import { UnshippedTable } from '@/components/unshipped/UnshippedTable';
import { PackerTable } from '@/components/PackerTable';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import { OrderRailCompare } from '@/components/dashboard/rail/OrderRailCompare';
import { useOrderRailSelection } from '@/hooks/useOrderRailSelection';
import { usePackWorkspaceTab } from '@/hooks/usePackWorkspaceTab';
import { useNewOrderParam } from '@/hooks/useNewOrderParam';
import { NewOrderEntryOverlay } from '@/components/orders/NewOrderEntryOverlay';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { DeskActionSlotRegistrar, DeskHeaderAction } from '@/design-system/components/DeskActionSlot';
import { LoaderFieldStatic } from '@/design-system/components/LoaderFieldStatic';
import { Plus } from '@/components/Icons';
import { dispatchPackActiveOrder } from '@/components/packer/usePackerOrderPane';
import { shippedOrderToPackPane } from '@/components/packer/shipped-order-to-pack-pane';
import type { ShippedOrder } from '@/types/orders';
import type { PackWorkspaceTab } from '@/utils/pack-workspace-state';


/**
 * The bench strip. `queue` is the default body, so it lights no tab — the same
 * rule every other strip follows.
 */
const PACK_VIEW_TABS = [{ id: 'history', label: 'History' }] as const;

export function PackWorkspaceView({ packerId }: { packerId: number }) {
  const { packView, setPackView } = usePackWorkspaceTab();
  const { newOpen, openNew, closeNew } = useNewOrderParam();
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
    <DeskPageLayout
      className="h-full"
      tabs={PACK_VIEW_TABS}
      activeTab={packView === 'queue' ? '' : packView}
      onTabChange={(id) => setPackView(id === packView ? 'queue' : (id as PackWorkspaceTab))}
    >
      {/*
        The bench's one page-level action, at page-header altitude. It already
        existed as a URL state (`?new=true`) with an opener that lived off in
        the rail; the frame gives it the place a primary action belongs, and the
        overlay it opens is unchanged.
      */}
      <DeskActionSlotRegistrar>
        <DeskHeaderAction
          variant="primary"
          size="md"
          icon={<Plus aria-hidden />}
          onClick={openNew}
        >
          New order
        </DeskHeaderAction>
      </DeskActionSlotRegistrar>
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
      <DashboardScrollShell className="h-full bg-transparent">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={packView}
              {...paneMotionProps}
              className="flex min-h-0 min-w-0 flex-1 flex-col"
            >
              <Suspense fallback={<LoaderFieldStatic label="Loading packing" />}>
                {packView === 'history' ? (
                  <PackerTable
                    packedBy={Number.isFinite(packerId) ? packerId : 0}
                  />
                ) : (
                  <UnshippedTable
                    strictSearchScope
                    selectMode={selectMode}
                    railSelection
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
            {selectionOverlays}
          </>
        ) : null}
      </DashboardScrollShell>
      <NewOrderEntryOverlay open={newOpen} onClose={closeNew} />
    </div>
    </DeskPageLayout>
  );
}
