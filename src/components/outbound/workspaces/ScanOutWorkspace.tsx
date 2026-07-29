'use client';

import { useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { StagedQueueTable } from '@/components/outbound/scan-out/StagedQueueTable';
import { StagedOrderDetail } from '@/components/outbound/shared/StagedOrderDetail';
import { WorkbenchTablePane } from '@/components/dashboard/workbench-shell';
import { useOutboundUrlState } from '@/hooks/useOutboundUrlState';
import type { ShippedOrder } from '@/lib/neon/orders-queries';

/**
 * `/shipping/scan-out` — the dock ship-confirm surface.
 *
 * The scan bar itself lives in the sidebar (`ScanOutModeBody`'s footer); this
 * pane is the padded staged queue you scan out of.
 */
export function ScanOutWorkspace() {
  const { q, open, setOpen } = useOutboundUrlState();

  const handleOpenOrder = useCallback(
    (order: ShippedOrder) => setOpen(Number(order.id)),
    [setOpen],
  );
  const handleCloseDetail = useCallback(() => setOpen(null), [setOpen]);

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
