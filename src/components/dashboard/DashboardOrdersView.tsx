'use client';

/**
 * The dashboard's main (left) region: the active orders table for the current
 * `?view`, with a Suspense skeleton, plus the bulk-action capsule that pins to
 * the bottom when rows are checked. Presentational — selection state + actions
 * are owned by useDashboardBulkSelection. Extracted from the dashboard page.
 */

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { UnshippedTable } from '@/components/unshipped/UnshippedTable';
import { Inbox, Loader2, PackageCheck } from '@/components/Icons';
import {
  HorizontalButtonSlider,
  type HorizontalSliderItem,
} from '@/components/ui/HorizontalButtonSlider';
import { ContextualSelectionBar } from '@/design-system/components/ContextualSelectionBar';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import type { SelectionAction } from '@/lib/selection/selection-actions';
import type { DashboardOrderView } from '@/utils/dashboard-search-state';
import type { DashSelectableRow } from '@/hooks/useDashboardBulkSelection';

// Phase 4 (bundle deferral): the three NON-default order views are code-split so
// their chunks load only when the user switches to that mode — the default
// Unshipped view (`UnshippedTable`, imported eagerly above) stays in the initial
// bundle so its first paint isn't gated on a second round-trip. `ssr: false`: the
// dashboard is a client shell behind BootGate, so there's no SSR to preserve.
function TableFallback() {
  return (
    <div className="flex-1 flex items-center justify-center bg-surface-canvas">
      <Loader2 className="w-8 h-8 animate-spin text-text-faint" />
    </div>
  );
}
const DashboardShippedTable = dynamic(
  () => import('@/components/shipped').then((m) => m.DashboardShippedTable),
  { ssr: false, loading: TableFallback },
);
const FBAShipmentsTable = dynamic(() => import('@/components/dashboard/FBAShipmentsTable'), {
  ssr: false,
  loading: TableFallback,
});
const WarrantyWorkspace = dynamic(
  () => import('@/components/warranty/WarrantyWorkspace').then((m) => m.WarrantyWorkspace),
  { ssr: false, loading: TableFallback },
);

interface DashboardOrdersViewProps {
  orderView: DashboardOrderView;
  /** Switch the Outbound tab (Unshipped ⇄ Shipped) — writes the `?view` URL param. */
  onSelectView: (view: DashboardOrderView) => void;
  selectMode: boolean;
  /** Flip select-mode — handed to each order board's in-toolbar Select toggle. */
  onToggleSelectMode: () => void;
  selectionEnabled: boolean;
  selectedRows: DashSelectableRow[];
  selectionActions: SelectionAction<DashSelectableRow>[];
}

/**
 * The Outbound tab strip (Unshipped ⇄ Shipped) pinned to the top-LEFT of the
 * main content. The former nav-rail split (two `?unshipped`/`?shipped` modes)
 * now lives here as an in-content tab; `?warranty` / `?fba` render their own
 * full surfaces and never show this strip.
 */
const OUTBOUND_TABS: HorizontalSliderItem[] = [
  { id: 'unshipped', label: 'Unshipped', icon: Inbox },
  { id: 'shipped', label: 'Shipped', icon: PackageCheck },
];

export function DashboardOrdersView({
  orderView,
  onSelectView,
  selectMode,
  onToggleSelectMode,
  selectionEnabled,
  selectedRows,
  selectionActions,
}: DashboardOrdersViewProps) {
  const showOutboundTabs = orderView === 'unshipped' || orderView === 'shipped';

  return (
    <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-surface-canvas">
      {showOutboundTabs ? (
        <div className="flex shrink-0 items-center border-b border-border-soft px-3">
          <HorizontalButtonSlider
            items={OUTBOUND_TABS}
            value={orderView}
            onChange={(id) => onSelectView(id as DashboardOrderView)}
            variant="nav"
            dense
            aria-label="Outbound orders"
          />
        </div>
      ) : null}

      {/* Exterior padding around the active table so rows breathe off the shell
          edges. For the Outbound tabs the table sits in a rounded card so the
          gutter reads as intentional; fba/warranty own their full-bleed
          surfaces (no gutter, no card frame). */}
      <div
        className={
          showOutboundTabs
            ? 'relative flex min-w-0 flex-1 overflow-hidden p-3'
            : 'relative flex min-w-0 flex-1 overflow-hidden'
        }
      >
        <div
          className={
            showOutboundTabs
              ? 'relative flex min-w-0 flex-1 overflow-hidden rounded-xl border border-border-soft bg-surface-card shadow-sm'
              : 'relative flex min-w-0 flex-1 overflow-hidden'
          }
        >
          <Suspense
            fallback={
              <div className="flex-1 flex items-center justify-center bg-surface-canvas">
                <Loader2 className="w-8 h-8 animate-spin text-text-faint" />
              </div>
            }
          >
            {orderView === 'shipped' ? (
              <DashboardShippedTable selectMode={selectMode} onToggleSelectMode={onToggleSelectMode} />
            ) : orderView === 'fba' ? (
              <FBAShipmentsTable />
            ) : orderView === 'warranty' ? (
              <WarrantyWorkspace />
            ) : (
              // 'unshipped' (the merged pre-ship backlog) + the default.
              <UnshippedTable strictSearchScope selectMode={selectMode} onToggleSelectMode={onToggleSelectMode} />
            )}
          </Suspense>
        </div>
      </div>

      {/* Bulk-action capsule — pins to the bottom of the orders region when rows
          are checked in the Unshipped / Shipped tables. */}
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
