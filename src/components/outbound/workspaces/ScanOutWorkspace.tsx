'use client';

import { useCallback } from 'react';
import { AnimatePresence } from '@/design-system/motion';
import { StagedQueueTable } from '@/components/outbound/scan-out/StagedQueueTable';
import { StagedOrderDetail } from '@/components/outbound/shared/StagedOrderDetail';
import { useOutboundUrlState } from '@/hooks/useOutboundUrlState';
import type { ShippedOrder } from '@/lib/neon/orders-queries';

/**
 * `/shipping/scan-out` — the dock ship-confirm surface.
 *
 * The scan bar itself lives in the sidebar (`ScanOutModeBody`'s footer); this
 * pane is the staged queue you scan out of. One lane, one table, no chrome —
 * the table draws its own find field and status bar.
 */
export function ScanOutWorkspace() {
  const { q, setQ, open, setOpen } = useOutboundUrlState();

  const handleOpenOrder = useCallback(
    (order: ShippedOrder) => setOpen(Number(order.id)),
    [setOpen],
  );
  const handleCloseDetail = useCallback(() => setOpen(null), [setOpen]);

  return (
    <div className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-surface-canvas">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <StagedQueueTable
          searchQuery={q}
          search={{ value: q, onChange: setQ, placeholder: 'Filter staged orders…' }}
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
  );
}
