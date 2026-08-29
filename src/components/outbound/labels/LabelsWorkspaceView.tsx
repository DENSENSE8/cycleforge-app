'use client';

/**
 * Labels-station Workbench on `/shipping` (labels mode) — the golden
 * DashboardScrollShell recipe: pinned chrome (Queue · Recent tabs + station
 * filters + Import) over one scroll body whose KPI strip scrolls away above the
 * grow-mode queue. Sibling of ShippingWorkspaceView / DashboardOrdersView
 * (docs/todo/display-convergence-log.md → Axis 5).
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
import { TableStatusBar } from '@/components/tables/TableStatusBar';
import type { LabelsWorkspaceTab } from '@/utils/labels-workspace-state';

interface LabelsWorkspaceViewProps {
  /** Open the label print/attach flow for a Queue-tab order (writes `?open=`). */
  onOpenLabelOrder: (order: ShippedOrder) => void;
}

/**
 * The desk strip. `queue` is the default body, so it lights no tab — the same
 * rule every other strip follows.
 */
const LABELS_VIEW_TABS = [{ id: 'recent', label: 'Recent' }] as const;

export function LabelsWorkspaceView({ onOpenLabelOrder }: LabelsWorkspaceViewProps) {
  const { labelsTab, setLabelsTab } = useLabelsWorkspaceTab();
  const { q, sort, setSort } = useOutboundUrlState();
  // Recent (staged) detail is local — it must not touch the Queue tab's `?open=`
  // label-print flow.
  const [recentOpenId, setRecentOpenId] = useState<number | null>(null);

  const toggleSort = useCallback(
    () => setSort(sort === 'newest' ? 'priority' : 'newest'),
    [sort, setSort],
  );

  const openRecent = useCallback((order: ShippedOrder) => {
    const id = Number(order.id);
    setRecentOpenId(Number.isFinite(id) && id > 0 ? id : null);
  }, []);
  const closeRecent = useCallback(() => setRecentOpenId(null), []);

  return (
    <div className="relative flex h-full min-w-0 flex-1 overflow-hidden bg-surface-canvas">
      {
          labelsTab === 'recent' ? (
            <StagedQueueTable
              searchQuery={q}
              onOpenOrder={openRecent}
              onCloseOrder={closeRecent}
              disableBackfill
            />
          ) : (
            <LabelsQueueTable
              searchQuery={q}
              sort={sort}
              onOpenOrder={onOpenLabelOrder}
              onCloseOrder={() => undefined}
            />
          )}
      {/* The desk switches body on a tab; each body foots its own strip. */}
      <TableStatusBar
        tabs={LABELS_VIEW_TABS}
        activeTab={labelsTab === 'queue' ? undefined : labelsTab}
        onTabChange={(id) =>
          setLabelsTab(id === labelsTab ? 'queue' : (id as LabelsWorkspaceTab))
        }
      />

      <AnimatePresence>
        {recentOpenId ? (
          <StagedOrderDetail key={recentOpenId} orderId={recentOpenId} onClose={closeRecent} />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
