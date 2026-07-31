'use client';

/**
 * Unbox browse workbench — tabs (Queue · Viewed · History) + KPI strip +
 * ReceivingLinesTable. Sidebar owns scan I/O + short Unboxed recent dock;
 * main pane is the table workbench (TestingWorkspaceView pattern).
 */

import { Suspense, useState } from 'react';
import dynamic from 'next/dynamic';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import {
  WORKBENCH_BODY_COLUMN,
  WORKBENCH_CHROME_COLUMN,
} from '@/components/dashboard/workbench-shell';
// Light leaf modules — NOT the heavy table component, so its board/column/
// grouping import graph stays out of this route chunk (code-split below).
import { RECEIVING_SELECTION_SCOPE } from '@/components/station/receiving-lines-table-helpers';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { UnboxKpiStrip } from '@/components/receiving/unbox/UnboxKpiStrip';
import { UnboxTableCardSkeleton } from '@/components/receiving/unbox/UnboxWorkbenchSkeleton';
import { UnboxWorkspaceHeader } from '@/components/receiving/unbox/UnboxWorkspaceHeader';
import { useSurfacePaintMark } from '@/lib/observability/paint-timing';
import { useUnboxWorkspaceTab } from '@/hooks/useUnboxWorkspaceTab';
import { useReceivingLineBulkSelection } from '@/hooks/useReceivingLineBulkSelection';
import { ContextualSelectionBar } from '@/design-system/components/ContextualSelectionBar';

// Code-split the heavy table (board lanes, column config, grouping, deep-link)
// off the Unbox route chunk: chrome + KPI paint from the small chunk first and
// the table chunk streams in behind the same structured skeleton.
const ReceivingLinesTable = dynamic(
  () => import('@/components/station/ReceivingLinesTable'),
  { loading: () => <UnboxTableCardSkeleton /> },
);

/** Copy line for a receiving carton/line: PO • SKU • tracking. */
function formatReceivingCopyRow(r: ReceivingLineRow): string {
  const po = (r.zoho_purchaseorder_number || r.zoho_purchaseorder_id || '').trim();
  const sku = (r.sku || '').trim();
  const tracking = (r.tracking_number || '').trim();
  return [po && `PO ${po}`, sku && `SKU ${sku}`, tracking && `TRK ${tracking}`]
    .filter(Boolean)
    .join(' • ');
}

export function UnboxWorkspaceView(_props: {
  /** Kept for UnboxLineWorkspace API; table selection is event-driven. */
  selectedLine: ReceivingLineRow | null;
}) {
  const { unboxView, setUnboxView } = useUnboxWorkspaceTab();
  const [controlsEl, setControlsEl] = useState<HTMLDivElement | null>(null);

  useSurfacePaintMark('unbox:chrome', true);

  const { selectMode, selectedRows, bulkActions } =
    useReceivingLineBulkSelection({
      scope: RECEIVING_SELECTION_SCOPE,
      active: true,
      formatCopyRow: formatReceivingCopyRow,
    });

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col">
      <DashboardScrollShell
        className="h-full bg-transparent"
        chrome={
          <div className={WORKBENCH_CHROME_COLUMN}>
            <UnboxWorkspaceHeader
              tab={unboxView}
              onSelectTab={setUnboxView}
              controlsSlotRef={setControlsEl}
            />
          </div>
        }
      >
        <div className={WORKBENCH_BODY_COLUMN}>
          <div className="mb-4">
            <UnboxKpiStrip mode={unboxView} />
          </div>

          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            {/* Structured fallback (searchParams suspension path) mirrors the
                table card + row anatomy — never a bare gray box. The dynamic()
                chunk-load path shows the same skeleton via its loading option. */}
            <Suspense fallback={<UnboxTableCardSkeleton />}>
              <ReceivingLinesTable
                key={unboxView}
                selectMode={selectMode}
                embedded
                toolbarPortalTarget={controlsEl}
              />
            </Suspense>
          </div>
        </div>
      </DashboardScrollShell>

      {selectMode ? (
        <ContextualSelectionBar
          scope={RECEIVING_SELECTION_SCOPE}
          rows={selectedRows}
          actions={bulkActions}
        />
      ) : null}
    </div>
  );
}
