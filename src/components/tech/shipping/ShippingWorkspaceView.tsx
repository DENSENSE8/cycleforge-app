'use client';

/**
 * Shipping mode Workbench on `/test` — sticky KPI strip + unified header
 * (Pending | History) + tab body. Mirrors DashboardOrdersView chrome
 * while the sidebar keeps Station scan / Up Next I/O.
 */

import { Suspense, useState } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion } from 'framer-motion';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { UnshippedTable } from '@/components/unshipped/UnshippedTable';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import { ShippingKpiStrip } from '@/components/tech/shipping/ShippingKpiStrip';
import { ShippingWorkspaceHeader } from '@/components/tech/shipping/ShippingWorkspaceHeader';
import {
  WORKBENCH_BODY_COLUMN,
  WORKBENCH_CHROME_COLUMN,
  WORKBENCH_TABLE_VIEWPORT,
} from '@/components/dashboard/workbench-shell';
import { ContextualSelectionBar } from '@/design-system/components/ContextualSelectionBar';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import { useDashboardBulkSelection } from '@/hooks/useDashboardBulkSelection';
import { useShippingWorkspaceTab } from '@/hooks/useShippingWorkspaceTab';
import { useNewOrderParam } from '@/hooks/useNewOrderParam';
import { NewOrderEntryOverlay } from '@/components/orders/NewOrderEntryOverlay';

function TableFallback() {
  return <div className="min-h-[240px] flex-1 bg-surface-canvas" aria-hidden />;
}

const TechTable = dynamic(
  () => import('@/components/TechTable').then((m) => m.TechTable),
  { ssr: false, loading: TableFallback },
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
  // Pending reuses the dashboard To Ship selection scope + actions (always-on
  // left-gutter select). Keep the hook on `unshipped` for every tab so selectMode
  // stays live when Pending remounts (History doesn't mount a selectable table).
  const { selectMode, selectedRows, selectionActions, bulkBarVisible } =
    useDashboardBulkSelection('unshipped');

  // Tab bodies crossfade as the singular focus surface (chrome + KPI strip stay
  // put) — same workbenchPane preset family as the receiving right pane.
  const paneMotionProps = {
    ...useMotionPresence(framerPresence.workbenchPane),
    transition: useMotionTransition(framerTransition.workbenchPaneMount),
  };

  return (
    // Flex column (not a bare block): `DashboardScrollShell` is `flex-1`, which
    // is inert outside a flex parent — the shell then collapses to content
    // height and the work canvas shows through below it. Mirrors Unbox/Triage.
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
    <DashboardScrollShell
      className="h-full"
      // Pinned chrome (outside the scroll port) is the one top bar; the KPI
      // strip in the body scrolls away and day headers dock at top-0 beneath
      // the chrome. Mirrors DashboardOrdersView's two-zone shell.
      chrome={
        <div className={WORKBENCH_CHROME_COLUMN}>
          <ShippingWorkspaceHeader
            tab={shipTab}
            onSelectTab={setShipTab}
            controlsSlotRef={setControlsEl}
            onNewOrder={openNew}
          />
        </div>
      }
    >
      <div className={WORKBENCH_BODY_COLUMN}>
        <div className="mb-4">
          <ShippingKpiStrip
            mode={shipTab}
            techId={Number.isFinite(parsedTechId) ? parsedTechId : undefined}
          />
        </div>

        <div className="relative flex min-w-0 flex-col">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={shipTab} {...paneMotionProps} className="flex min-w-0 flex-col">
              <Suspense fallback={<div className="min-h-[240px] bg-surface-canvas" aria-hidden />}>
                {shipTab === 'history' ? (
                  // Bounded host so the framed card's bottom edge (and its
                  // raised elevation) stay on screen and the table self-scrolls
                  // instead of growing the page — same as the Pending grid.
                  <div className={`${WORKBENCH_TABLE_VIEWPORT} pb-3`}>
                    <TechTable
                      testedBy={Number.isFinite(parsedTechId) ? parsedTechId : 0}
                      staffScope="url-or-self"
                      toolbarPortalTarget={controlsEl}
                    />
                  </div>
                ) : (
                  <UnshippedTable
                    strictSearchScope
                    selectMode={selectMode}
                    bulkBarInset={bulkBarVisible}
                    toolbarPortalTarget={controlsEl}
                  />
                )}
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {shipTab === 'pending' ? (
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
