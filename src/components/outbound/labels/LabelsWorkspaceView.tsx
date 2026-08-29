'use client';

/**
 * Labels-station Workbench on `/shipping` (labels mode).
 *
 * The desk draws no chrome: it picks the BODY the `?labelsTab=` mode wants and
 * hands it the find field and the mode strip as data. The table draws both.
 *
 * The Queue tab opens the label print/attach flow via `?open=` (owned by the
 * parent OutboundWorkspace); the Recent tab (recently-labeled / staged) opens a
 * read-only staged detail slide-over of its own.
 */

import { useCallback, useState } from 'react';
import { AnimatePresence } from '@/design-system/motion';
import { LabelsQueueTable } from '@/components/outbound/labels/LabelsQueueTable';
import { StagedQueueTable } from '@/components/outbound/scan-out/StagedQueueTable';
import { StagedOrderDetail } from '@/components/outbound/shared/StagedOrderDetail';
import { useLabelsWorkspaceTab } from '@/hooks/useLabelsWorkspaceTab';
import { useOutboundUrlState } from '@/hooks/useOutboundUrlState';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import type { DataTableTabStrip } from '@/components/tables/TableStatusBar';

interface LabelsWorkspaceViewProps {
  /** Open the label print/attach flow for a Queue-tab order (writes `?open=`). */
  onOpenLabelOrder: (order: ShippedOrder) => void;
}

export function LabelsWorkspaceView({ onOpenLabelOrder }: LabelsWorkspaceViewProps) {
  const { labelsTab, setLabelsTab } = useLabelsWorkspaceTab();
  const { q, sort, setQ } = useOutboundUrlState();
  // Recent (staged) detail is local — it must not touch the Queue tab's `?open=`
  // label-print flow.
  const [recentOpenId, setRecentOpenId] = useState<number | null>(null);

  const openRecent = useCallback((order: ShippedOrder) => {
    const id = Number(order.id);
    setRecentOpenId(Number.isFinite(id) && id > 0 ? id : null);
  }, []);
  const closeRecent = useCallback(() => setRecentOpenId(null), []);

  const tabStrip: DataTableTabStrip = {
    tabs: [
      { id: 'queue', label: 'Queue' },
      { id: 'recent', label: 'Recent' },
    ],
    activeTab: labelsTab,
    onTabChange: (id) => setLabelsTab(id as typeof labelsTab),
  };
  const search = { value: q, onChange: setQ, placeholder: 'Filter labels…' };

  return (
    <div className="relative flex h-full min-w-0 flex-1 overflow-hidden bg-surface-canvas">
      {labelsTab === 'recent' ? (
        <StagedQueueTable
          searchQuery={q}
          search={search}
          tabStrip={tabStrip}
          onOpenOrder={openRecent}
          onCloseOrder={closeRecent}
          disableBackfill
        />
      ) : (
        <LabelsQueueTable
          searchQuery={q}
          search={search}
          tabStrip={tabStrip}
          sort={sort}
          onOpenOrder={onOpenLabelOrder}
          onCloseOrder={() => undefined}
        />
      )}

      <AnimatePresence>
        {recentOpenId ? (
          <StagedOrderDetail key={recentOpenId} orderId={recentOpenId} onClose={closeRecent} />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
