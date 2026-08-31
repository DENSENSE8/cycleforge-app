'use client';

import { useCallback } from 'react';
import { AnimatePresence } from '@/design-system/motion';
import { StagedQueueTable } from '@/components/outbound/scan-out/StagedQueueTable';
import { StagedOrderDetail } from '@/components/outbound/shared/StagedOrderDetail';
import { useOutboundUrlState } from '@/hooks/useOutboundUrlState';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import type { ShippedOrder } from '@/lib/neon/orders-queries';

/**
 * `/shipping/scan-out` — the dock ship-confirm surface.
 *
 * The scan bar itself lives in the sidebar (`ScanOutModeBody`'s footer); this
 * pane is the staged queue you scan out of.
 *
 * It wears the one page frame ({@link DeskPageChrome} via
 * {@link DeskPageLayout}) like every other station as of 2026-08-31. Single
 * lane, so it passes NO tabs and the frame draws no tab row: it gets the title
 * and the card, which is the honest shape rather than a strip holding one
 * entry.
 */
export function ScanOutWorkspace() {
  const { q, open, setOpen } = useOutboundUrlState();

  const handleOpenOrder = useCallback(
    (order: ShippedOrder) => setOpen(Number(order.id)),
    [setOpen],
  );
  const handleCloseDetail = useCallback(() => setOpen(null), [setOpen]);

  return (
    <DeskPageLayout className="h-full">
    <div className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <StagedQueueTable
          searchQuery={q}
          onOpenOrder={handleOpenOrder}
          onCloseOrder={handleCloseDetail}
        />
      </div>
      <AnimatePresence>
        {open ? (
          <StagedOrderDetail key={open} orderId={open} onClose={handleCloseDetail} />
        ) : null}
      </AnimatePresence>
    </div>
    </DeskPageLayout>
  );
}
