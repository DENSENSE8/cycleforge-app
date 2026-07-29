'use client';

import { useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LabelsOrderWorkspace } from '@/components/outbound/labels/LabelsOrderWorkspace';
import { LabelsWorkspaceView } from '@/components/outbound/labels/LabelsWorkspaceView';
import { NewOrderEntryOverlay } from '@/components/orders/NewOrderEntryOverlay';
import { useOutboundUrlState } from '@/hooks/useOutboundUrlState';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { zIndex } from '@/design-system/tokens/z-index';
import type { ShippedOrder } from '@/lib/neon/orders-queries';

/**
 * `/shipping/labels` — the golden tabbed Queue/Recent workbench, always mounted
 * (cache + scroll preserved); the focused label / packing-slip workspace
 * overlays it when an order is opened. One singular focus surface, keyed on the
 * open order id — the Unbox browse/overlay pattern.
 *
 * Split out of `OutboundWorkspace`'s `?mode=` branch: the mode is the route now,
 * so each workspace is reached by navigating rather than by a ternary.
 */
export function LabelsWorkspace() {
  const { open, newOpen, setOpen, closeNew } = useOutboundUrlState();

  const handleOpenOrder = useCallback(
    (order: ShippedOrder) => setOpen(Number(order.id)),
    [setOpen],
  );
  const handleCloseDetail = useCallback(() => setOpen(null), [setOpen]);

  const paneMotionProps = {
    ...useMotionPresence(framerPresence.workbenchPaneSettle),
    transition: useMotionTransition(framerTransition.workbenchPaneSettle),
  };

  const overlayOpen = Boolean(open);

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-surface-canvas">
      <div
        className={`flex h-full min-h-0 w-full flex-col ${overlayOpen ? 'pointer-events-none' : ''}`}
        aria-hidden={overlayOpen ? true : undefined}
        inert={overlayOpen ? true : undefined}
        style={{ visibility: overlayOpen ? 'hidden' : 'visible' }}
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
