'use client';

import { useCallback, Suspense } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LabelsOrderWorkspace } from '@/components/outbound/labels/LabelsOrderWorkspace';
import { LabelsWorkspaceView } from '@/components/outbound/labels/LabelsWorkspaceView';
import { StagedQueueTable } from '@/components/outbound/scan-out/StagedQueueTable';
import { StagedOrderDetail } from '@/components/outbound/shared/StagedOrderDetail';
import { ReadyWorkspaceView } from '@/components/outbound/ready/ReadyWorkspaceView';
import { FbaOutboundWorkspace } from '@/components/fba/FbaOutboundWorkspace';
import { NewOrderEntryOverlay } from '@/components/orders/NewOrderEntryOverlay';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useOutboundUrlState } from '@/hooks/useOutboundUrlState';
import { WorkbenchTablePane } from '@/components/dashboard/workbench-shell';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { zIndex } from '@/design-system/tokens/z-index';
import type { ShippedOrder } from '@/lib/neon/orders-queries';

export function OutboundWorkspace() {
  const { mode, open, q, newOpen, setOpen, closeNew } = useOutboundUrlState();

  const handleOpenOrder = useCallback(
    (order: ShippedOrder) => setOpen(Number(order.id)),
    [setOpen],
  );

  const handleCloseDetail = useCallback(() => setOpen(null), [setOpen]);

  // Labels mode: the browse workbench (Queue/Recent) stays mounted; the focused
  // order workspace (label + packing-slip flow) crossfades OVER it at z-panel —
  // the Unbox browse/overlay pattern (UnboxLineWorkspace), one singular focus
  // surface, keyed on the open order id.
  const paneMotionProps = {
    ...useMotionPresence(framerPresence.workbenchPaneSettle),
    transition: useMotionTransition(framerTransition.workbenchPaneSettle),
  };

  // Modes are switched from the master-nav header mode cluster, not a top tab
  // band — each mode is its own contextual surface: Labels (tabbed Queue/Recent
  // workbench ⇄ print), Scan out (dock Station), Ready (allocation table), FBA
  // (board).
  if (mode === 'fba') {
    return (
      <Suspense
        fallback={
          <div className="flex h-full w-full items-center justify-center bg-surface-card">
            <LoadingSpinner size="lg" className="text-violet-600" />
          </div>
        }
      >
        <FbaOutboundWorkspace />
      </Suspense>
    );
  }

  if (mode === 'ready') {
    return <ReadyWorkspaceView />;
  }

  if (mode === 'scan-out') {
    // The dock scan bar lives in the sidebar (ScanOutModeBody footer); the main
    // pane is the padded staged queue you scan out of.
    return (
      <div className="relative flex h-full min-w-0 flex-1 overflow-hidden bg-surface-canvas">
        <WorkbenchTablePane>
          <StagedQueueTable
            searchQuery={q}
            onOpenOrder={handleOpenOrder}
            onCloseOrder={handleCloseDetail}
            hideHeader
          />
        </WorkbenchTablePane>
        <AnimatePresence>
          {open ? (
            <StagedOrderDetail key={open} orderId={open} onClose={handleCloseDetail} />
          ) : null}
        </AnimatePresence>
      </div>
    );
  }

  // Labels — the golden tabbed Queue/Recent workbench (LabelsWorkspaceView)
  // always mounted (cache + scroll preserved); the focused label/packing-slip
  // workspace overlays it when an order is opened.
  const labelsOverlayOpen = Boolean(open);
  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-surface-canvas">
      <div
        className={`flex h-full min-h-0 w-full flex-col ${labelsOverlayOpen ? 'pointer-events-none' : ''}`}
        aria-hidden={labelsOverlayOpen ? true : undefined}
        inert={labelsOverlayOpen ? true : undefined}
        style={{ visibility: labelsOverlayOpen ? 'hidden' : 'visible' }}
      >
        <LabelsWorkspaceView onOpenLabelOrder={handleOpenOrder} />
      </div>

      <AnimatePresence initial={false} mode="wait">
        {open ? (
          <motion.div
            key={`labels-order-${open}`}
            {...paneMotionProps}
            style={{ zIndex: zIndex.panel }}
            className="absolute inset-0 flex min-h-0 flex-col bg-surface-card"
          >
            <LabelsOrderWorkspace orderId={open} onClose={handleCloseDetail} />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <NewOrderEntryOverlay open={newOpen} onClose={closeNew} />
    </div>
  );
}
