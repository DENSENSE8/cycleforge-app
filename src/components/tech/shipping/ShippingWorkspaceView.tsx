'use client';

/** Shipping mode Workbench on `/test` — Sheets flush chrome (Unbox recipe): */

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion, motionRole, useMotionRole } from '@/design-system/motion';
import { UnshippedTable } from '@/components/unshipped/UnshippedTable';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import { TechAllTriageTable } from '@/components/tech/all/TechAllTriageTable';
import { useOrderRailSelection } from '@/hooks/useOrderRailSelection';
import { useShippingWorkspaceTab } from '@/hooks/useShippingWorkspaceTab';
import { useNewOrderParam } from '@/hooks/useNewOrderParam';
import { NewOrderEntryOverlay } from '@/components/orders/NewOrderEntryOverlay';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { DeskActionSlotRegistrar, DeskHeaderAction } from '@/design-system/components/DeskActionSlot';
import { Plus } from '@/components/Icons';
import type { ShippingWorkspaceTab } from '@/utils/shipping-workspace-state';

function TableFallback() {
  return <div className="min-h-[240px] flex-1 bg-surface-canvas" aria-hidden />;
}

const TechTable = dynamic(
  () => import('@/components/TechTable').then((m) => m.TechTable),
  // SSR allowed — shipping history is not `/test` LCP (Testing centre is).
  // Loading fallback is the stand-in while the chunk resolves.
  { loading: TableFallback },
);

interface ShippingWorkspaceViewProps {
  /** Signed-in tech id — used as History fallback when staff filter is set to Me via URL. */
  techId: string;
}

/** The bench strip. */
const SHIPPING_VIEW_TABS = [
  { id: 'urgent', label: 'Urgent' },
  { id: 'history', label: 'History' },
] as const;

/** Ids the strip can light. Anything else is the unlit default body. */
const SHIPPING_LIT_TABS: ReadonlySet<string> = new Set(
  SHIPPING_VIEW_TABS.map((t) => t.id),
);

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

  const { presence, transition } = useMotionRole(motionRole.swap.focus);
  const paneMotionProps = { ...presence, transition };

  return (
    <DeskPageLayout
      className="h-full"
      tabs={SHIPPING_VIEW_TABS}
      activeTab={SHIPPING_LIT_TABS.has(shipTab) ? shipTab : ''}
      onTabChange={(id) => setShipTab(id === shipTab ? 'pending' : (id as ShippingWorkspaceTab))}
    >
      {/* The bench's one page-level action, at page-header altitude. */}
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
              key={shipTab}
              {...paneMotionProps}
              className="flex min-h-0 min-w-0 flex-1 flex-col"
            >
              <Suspense fallback={<div className="min-h-[240px] bg-surface-canvas" aria-hidden />}>
                {shipTab === 'history' ? (
                  <TechTable
                    testedBy={Number.isFinite(parsedTechId) ? parsedTechId : 0}
                    staffScope="url-or-self"
                  />
                ) : shipTab === 'all' ? (
                  <TechAllTriageTable scope="shipping" />
                ) : (
                  <UnshippedTable
                    strictSearchScope
                    selectMode={selectMode}
                    railSelection
                  />
                )}
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </div>

        {queueTab && selectionEnabled ? selectionOverlays : null}
      </DashboardScrollShell>
      <NewOrderEntryOverlay open={newOpen} onClose={closeNew} />
    </div>
    </DeskPageLayout>
  );
}
