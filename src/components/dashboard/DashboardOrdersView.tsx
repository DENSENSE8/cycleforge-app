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
import { ContextualSelectionBar } from '@/design-system/components/ContextualSelectionBar';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import type { SelectionAction } from '@/lib/selection/selection-actions';
import type { DashboardOrderView } from '@/utils/dashboard-search-state';
import type { DashSelectableRow } from '@/hooks/useDashboardBulkSelection';
import { useOutboundMyWorkDefault } from '@/hooks/useOutboundMyWorkDefault';

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
const FBAShipmentsTable = dynamic(() => import('@/components/dashboard/FBAShipmentsTable'), {
  ssr: false,
  loading: TableFallback,
});

interface DashboardOrdersViewProps {
  orderView: DashboardOrderView;
  /** Switch the lifecycle tab (To Ship · Packed · Shipped) — writes the URL view flag. */
  onSelectView: (view: DashboardOrderView) => void;
  selectMode: boolean;
  /** Flip select-mode — handed to each order list's in-toolbar Select toggle. */
  onToggleSelectMode: () => void;
  selectionEnabled: boolean;
  selectedRows: DashSelectableRow[];
  selectionActions: SelectionAction<DashSelectableRow>[];
}

export function DashboardOrdersView({
  orderView,
  onSelectView,
  selectMode,
  onToggleSelectMode,
  selectionEnabled,
  selectedRows,
  selectionActions,
}: DashboardOrdersViewProps) {
  const showOutboundChrome =
    orderView === 'unshipped' || orderView === 'packed' || orderView === 'shipped';
  const [outboundControlsEl, setOutboundControlsEl] = useState<HTMLDivElement | null>(null);
  // Sticky My work default: inject ?staff=<me> on clean outbound URLs.
  useOutboundMyWorkDefault(showOutboundChrome);

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-canvas">
      {/* One content column for the whole outbound surface — KPI strip, header
          bar, and list share the same max-width + horizontal gutter. */}
      <div
        className={
          showOutboundChrome
            ? 'relative mx-auto flex h-full min-h-0 w-full max-w-[1440px] min-w-0 flex-1 flex-col gap-4 overflow-hidden px-4 pb-6 pt-5 sm:px-6 lg:px-8'
            : 'relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'
        }
      >
        {showOutboundChrome ? (
          <OutboundKpiStrip
            mode={orderView === 'packed' ? 'shipped' : (orderView as 'unshipped' | 'shipped')}
          />
        ) : null}

        {showOutboundChrome ? (
          <OutboundWorkspaceHeader
            orderView={orderView}
            onSelectView={onSelectView}
            controlsSlotRef={setOutboundControlsEl}
          />
        ) : null}

        <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <Suspense fallback={<div className="flex-1 bg-surface-canvas" aria-hidden />}>
            {orderView === 'shipped' ? (
              <DashboardShippedTable
                selectMode={selectMode}
                onToggleSelectMode={onToggleSelectMode}
                toolbarPortalTarget={outboundControlsEl}
              />
            ) : orderView === 'packed' ? (
              <PackedOrdersTable
                selectMode={selectMode}
                onToggleSelectMode={onToggleSelectMode}
                toolbarPortalTarget={outboundControlsEl}
              />
            ) : orderView === 'fba' ? (
              <FBAShipmentsTable />
            ) : (
              <UnshippedTable
                strictSearchScope
                selectMode={selectMode}
                onToggleSelectMode={onToggleSelectMode}
                toolbarPortalTarget={outboundControlsEl}
              />
            )}
          </Suspense>
        </div>
      </div>

      {/* Bulk-action capsule — pins to the bottom of the orders region when rows
          are checked in the To Ship / Packed / Shipped lists. */}
      {selectionEnabled ? (
        <ContextualSelectionBar
          scope={DASHBOARD_ORDERS_SELECTION_SCOPE}
          rows={selectedRows}
          actions={selectionActions}
        />
      ) : null}
    </div>
  );
}
