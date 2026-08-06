'use client';

import { useCallback } from 'react';
import { AnimatePresence } from '@/design-system/motion';
import { StagedQueueTable } from '@/components/outbound/scan-out/StagedQueueTable';
import { StagedOrderDetail } from '@/components/outbound/shared/StagedOrderDetail';
import { WORKBENCH_SHEET_HOST } from '@/components/dashboard/workbench-shell';
import { useOutboundUrlState } from '@/hooks/useOutboundUrlState';
import type { ShippedOrder } from '@/lib/neon/orders-queries';

/**
 * `/shipping/scan-out` — the dock ship-confirm surface.
 *
 * The scan bar itself lives in the sidebar (`ScanOutModeBody`'s footer); this
 * pane is the staged queue you scan out of. Single-lane (no tabs / KPI), so the
 * five-row Sheets stack degenerates to the flush data-table row: the staged
 * queue mounts flush in `WORKBENCH_SHEET_HOST` — no framed padded-card CLIP
 * island around a table that already owns a sheet host internally.
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
      <div className={WORKBENCH_SHEET_HOST}>
        <StagedQueueTable
          searchQuery={q}
          onOpenOrder={handleOpenOrder}
          onCloseOrder={handleCloseDetail}
          hideHeader
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
