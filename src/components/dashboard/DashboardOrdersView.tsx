'use client';

/**
 * The dashboard's main orders region: KPI strip + unified outbound header
 * (lifecycle slider · contextual filters/controls) + the active list for the
 * current tab. Presentational — selection state + actions are owned by
 * useDashboardBulkSelection. Extracted from the dashboard page.
 */

import { Suspense, useState } from 'react';
import dynamic from 'next/dynamic';
import { UnshippedTable } from '@/components/unshipped/UnshippedTable';
import { PackedOrdersTable } from '@/components/dashboard/PackedOrdersTable';
import { OutboundKpiStrip } from '@/components/dashboard/OutboundKpiStrip';
import { OutboundWorkspaceHeader } from '@/components/dashboard/OutboundWorkspaceHeader';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import {
  WORKBENCH_BODY_COLUMN,
  WORKBENCH_CHROME_COLUMN,
} from '@/components/dashboard/workbench-shell';
import { ContextualSelectionBar } from '@/design-system/components/ContextualSelectionBar';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import type { SelectionAction } from '@/lib/selection/selection-actions';
import type { DashboardOrderView } from '@/utils/dashboard-search-state';
import type { DashSelectableRow } from '@/hooks/useDashboardBulkSelection';

// Phase 4 (bundle deferral): non-default order views are code-split so their
// chunks load only when the user switches tabs — the default To Ship view
// (`UnshippedTable`) stays in the initial bundle. `ssr: false`: the dashboard
// is a client shell behind BootGate, so there's no SSR to preserve.
function TableFallback() {
  return <div className="flex-1 bg-surface-canvas" aria-hidden />;
}
const DashboardShippedTable = dynamic(
  () => import('@/components/shipped').then((m) => m.DashboardShippedTable),
  { ssr: false, loading: TableFallback },
);
const FbaShipmentsTable = dynamic(() => import('@/components/fba/FbaShipmentsTable'), {
  ssr: false,
  loading: TableFallback,
});

interface DashboardOrdersViewProps {
  orderView: DashboardOrderView;
  /** Switch the lifecycle tab (To Ship · Packed · Shipped) — writes the URL view flag. */
  onSelectView: (view: DashboardOrderView) => void;
  selectMode: boolean;
  selectionEnabled: boolean;
  selectedRows: DashSelectableRow[];
  selectionActions: SelectionAction<DashSelectableRow>[];
}

export function DashboardOrdersView({
  orderView,
  onSelectView,
  selectMode,
  selectionEnabled,
  selectedRows,
  selectionActions,
}: DashboardOrdersViewProps) {
  const showOutboundChrome =
    orderView === 'unshipped' || orderView === 'packed' || orderView === 'shipped';
  const [outboundControlsEl, setOutboundControlsEl] = useState<HTMLDivElement | null>(null);

  return (
    <DashboardScrollShell
      // The lifecycle tabs + filters are the one always-pinned top bar. They
      // live in the shell's chrome slot (outside the scroll port), so day-band
      // headers dock at top-0 of the body directly beneath them — no offset
      // math, no second sticky band competing for the same top.
      chrome={
        showOutboundChrome ? (
          <div className={WORKBENCH_CHROME_COLUMN}>
            <OutboundWorkspaceHeader
              orderView={orderView}
              onSelectView={onSelectView}
              controlsSlotRef={setOutboundControlsEl}
            />
          </div>
        ) : undefined
      }
    >
      {/* Scroll body: KPI strip scrolls away above the list; the list's day
          headers are the only sticky layer left inside the port. */}
      <div className={showOutboundChrome ? WORKBENCH_BODY_COLUMN : 'relative flex min-w-0 flex-col'}>
        {showOutboundChrome ? (
          <div className="mb-4">
            <OutboundKpiStrip
              mode={orderView === 'packed' ? 'shipped' : (orderView as 'unshipped' | 'shipped')}
            />
          </div>
        ) : null}

        <div className="relative flex min-w-0 flex-col">
          <Suspense fallback={<div className="min-h-[240px] bg-surface-canvas" aria-hidden />}>
            {orderView === 'shipped' ? (
              <DashboardShippedTable
                selectMode={selectMode}
                toolbarPortalTarget={outboundControlsEl}
              />
            ) : orderView === 'packed' ? (
              <PackedOrdersTable
                selectMode={selectMode}
                toolbarPortalTarget={outboundControlsEl}
              />
            ) : orderView === 'fba' ? (
              <FbaShipmentsTable />
            ) : (
              <UnshippedTable
                strictSearchScope
                selectMode={selectMode}
                toolbarPortalTarget={outboundControlsEl}
              />
            )}
          </Suspense>
        </div>
      </div>

      {selectionEnabled ? (
        <ContextualSelectionBar
          scope={DASHBOARD_ORDERS_SELECTION_SCOPE}
          rows={selectedRows}
          actions={selectionActions}
          pinToViewport
        />
      ) : null}
    </DashboardScrollShell>
  );
}
