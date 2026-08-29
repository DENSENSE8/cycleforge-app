'use client';

/**
 * Shipping mode Workbench on `/test` — Sheets flush chrome (Unbox recipe):
 * tabs · KPI · triage in one pinned sheet-chrome stack; body is
 * WORKBENCH_SHEET_HOST. Sidebar keeps Station scan / Up Next I/O.
 *
 * Multi-select opens the order right-rail plane (History / dashboard SoT) —
 * no bottom ContextualSelectionBar capsule.
 */

import { Suspense, useState } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion, motionRole, useMotionRole } from '@/design-system/motion';
import { UnshippedTable } from '@/components/unshipped/UnshippedTable';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import {
  ShippingTriageBand,
  ShippingWorkspaceHeader,
} from '@/components/tech/shipping/ShippingWorkspaceHeader';
import { TechAllTriageTable } from '@/components/tech/all/TechAllTriageTable';
import {
  WORKBENCH_SHEET_CHROME,
  WORKBENCH_SHEET_HOST,
} from '@/components/dashboard/workbench-shell';
import { OrderRailCompare } from '@/components/dashboard/rail/OrderRailCompare';
import { OrderRailShell } from '@/components/dashboard/rail/OrderRailShell';
import { useOrderRailSelection } from '@/hooks/useOrderRailSelection';
import { useShippingWorkspaceTab } from '@/hooks/useShippingWorkspaceTab';
import { useNewOrderParam } from '@/hooks/useNewOrderParam';
import { NewOrderEntryOverlay } from '@/components/orders/NewOrderEntryOverlay';
import { StationDeck } from '@/components/station/StationDeck';
import { ShippingHistoryDock } from '@/components/station/ShippingHistoryDock';
import { cn } from '@/utils/_cn';

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
  const [controlsEl, setControlsEl] = useState<HTMLDivElement | null>(null);
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
    // History is the leftmost column of the bench and is always on screen —
    // "did that scan land?" is the question this station is asked most, and the
    // interaction budget puts a status overview at ≤ 1 interaction.
    <StationDeck history={<ShippingHistoryDock station="Shipping" />}>
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
      <DashboardScrollShell
        className="h-full bg-transparent"
        chrome={
          <div className={cn(WORKBENCH_SHEET_CHROME, 'flex flex-col gap-0')}>
            <ShippingWorkspaceHeader
              tab={shipTab}
              onSelectTab={setShipTab}
              onNewOrder={openNew}
              className="rounded-none border-l-0 border-t-0 shadow-sm"
            />
            <ShippingTriageBand
              tab={shipTab}
              controlsSlotRef={setControlsEl}
            />
          </div>
        }
      >
        <div className={WORKBENCH_SHEET_HOST}>
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
                    toolbarPortalTarget={controlsEl}
                  />
                ) : shipTab === 'all' ? (
                  <TechAllTriageTable scope="shipping" columnTriggerPortalTarget={controlsEl} />
                ) : (
                  <UnshippedTable
                    strictSearchScope
                    selectMode={selectMode}
                    railSelection
                    toolbarPortalTarget={controlsEl}
                  />
                )}
              </Suspense>
            </motion.div>
          </AnimatePresence>
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
    </StationDeck>
  );
}
