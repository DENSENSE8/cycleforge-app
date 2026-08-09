'use client';

import { useCallback, useState } from 'react';
import { AnimatePresence } from '@/design-system/motion';
import { StagedQueueTable } from '@/components/outbound/scan-out/StagedQueueTable';
import { StagedOrderDetail } from '@/components/outbound/shared/StagedOrderDetail';
import {
  WORKBENCH_SHEET_CHROME,
  WORKBENCH_SHEET_HOST,
  WorkbenchChromeHeader,
} from '@/components/dashboard/workbench-shell';
import { useOutboundUrlState } from '@/hooks/useOutboundUrlState';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { cn } from '@/utils/_cn';

/**
 * `/shipping/scan-out` — the dock ship-confirm surface.
 *
 * The scan bar itself lives in the sidebar (`ScanOutModeBody`'s footer); this
 * pane is the staged queue you scan out of. Single-lane (no KPI), so the
 * five-row Sheets stack degenerates to Band-1 chrome (▦ host) over the flush
 * data-table row in `WORKBENCH_SHEET_HOST` — no framed padded-card CLIP island
 * around a table that already owns a sheet host internally.
 */
export function ScanOutWorkspace() {
  const { q, open, setOpen } = useOutboundUrlState();
  // ▦ portals into Band-1 controls (find lives in the scan-out sidebar).
  const [controlsEl, setControlsEl] = useState<HTMLDivElement | null>(null);

  const handleOpenOrder = useCallback(
    (order: ShippedOrder) => setOpen(Number(order.id)),
    [setOpen],
  );
  const handleCloseDetail = useCallback(() => setOpen(null), [setOpen]);

  return (
    <div className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-surface-canvas">
      <div className={cn(WORKBENCH_SHEET_CHROME, 'flex flex-col gap-0')}>
        <WorkbenchChromeHeader
          density="band"
          tabs={[{ id: 'staged', label: 'Staged' }]}
          activeTab="staged"
          onTabChange={() => undefined}
          controlsSlotRef={setControlsEl}
          className="rounded-none border-l-0 border-t-0 shadow-sm"
        />
      </div>
      <div className={WORKBENCH_SHEET_HOST}>
        <StagedQueueTable
          searchQuery={q}
          onOpenOrder={handleOpenOrder}
          onCloseOrder={handleCloseDetail}
          hideHeader
          columnTriggerPortalTarget={controlsEl}
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
