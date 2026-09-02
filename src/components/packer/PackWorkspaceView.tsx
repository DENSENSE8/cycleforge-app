'use client';

/**
 * Pack browse workbench — Queue (ready-to-pack) · History (packer logs).
 *
 * Wears {@link DeskPageLayout}: Packing title + Queue | History (Queue always
 * leftmost, always drawn — even with no assigned packer) + New order CTA.
 */

import { Suspense, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
import {
  DeskActionSlotRegistrar,
  DeskHeaderAction,
} from '@/design-system/components/DeskActionSlot';
import { Plus } from '@/components/Icons';
import { dispatchPackActiveOrder } from '@/components/packer/usePackerOrderPane';
import { shippedOrderToPackPane } from '@/components/packer/shipped-order-to-pack-pane';
import type { ShippedOrder } from '@/types/orders';
import {
  PACK_WORKSPACE_TAB_LABEL,
  PACK_WORKSPACE_TABS,
  type PackWorkspaceTab,
} from '@/utils/pack-workspace-state';

function TableFallback() {
  return <div className="min-h-[240px] flex-1 bg-surface-canvas" aria-hidden />;
}

const PACK_VIEW_TABS = PACK_WORKSPACE_TABS.map((id) => ({
  id,
  label: PACK_WORKSPACE_TAB_LABEL[id],
}));

export function PackWorkspaceView({ packerId }: { packerId: number }) {
  const { packView, setPackView } = usePackWorkspaceTab();
  const { newOpen, openNew, closeNew } = useNewOrderParam();
  const queueActive = packView === 'queue';
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectionEnabled, selectMode, selectionOverlays } = useOrderRailSelection(
    'unshipped',
    { publish: queueActive },
  );

  const { presence, transition } = useMotionRole(motionRole.swap.focus);
  const paneMotionProps = { ...presence, transition };

  // Pack Queue opens on the TESTED (ready-to-pack) lane when no ustatus is set.
  useEffect(() => {
    if (packView !== 'queue') return;
    if (String(searchParams.get('ustatus') || '').trim()) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('ustatus', 'TESTED');
    const qs = params.toString();
    const base = pathname || '/pack';
    router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
  }, [packView, searchParams, pathname, router]);

  const handleOpenQueueRecord = (record: ShippedOrder) => {
    dispatchPackActiveOrder(shippedOrderToPackPane(record));
  };

  return (
    <DeskPageLayout
      className="h-full"
      tabs={PACK_VIEW_TABS}
      activeTab={packView}
      onTabChange={(id) => setPackView(id as PackWorkspaceTab)}
    >
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
                <Suspense fallback={<TableFallback />}>
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
                      searchEmptyTitle="Awaiting scan"
                      searchResultLabel="orders ready to pack"
                      clearSearchLabel="Show all ready-to-pack"
                      awaitingMessage="Awaiting scan"
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
