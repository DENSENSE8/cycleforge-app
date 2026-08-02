'use client';

/**
 * The dashboard's main orders region: outbound KPI strip + unified outbound
 * header (lifecycle slider · contextual filters/controls) + the active list for
 * the current tab. Presentational — selection state + actions are owned by
 * useDashboardBulkSelection. Extracted from the dashboard page.
 */

import { Suspense, useState, type ReactNode } from 'react';
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
import { OrderRailCompare } from '@/components/dashboard/rail/OrderRailCompare';
import { OrderRailShell } from '@/components/dashboard/rail/OrderRailShell';
import {
  isPrePackOrderView,
  type DashboardOrderView,
} from '@/utils/dashboard-search-state';

// Phase 4 (bundle deferral): non-default order views are code-split so their
// chunks load only when the user switches tabs — the default Pending view
// (`UnshippedTable`) stays in the initial bundle. `ssr: false`: the dashboard
// is a client shell behind BootGate, so there's no SSR to preserve.
function TableFallback() {
  return <div className="flex-1 bg-surface-canvas" aria-hidden />;
}
const DashboardShippedTable = dynamic(
  () => import('@/components/shipped').then((m) => m.DashboardShippedTable),
  { ssr: false, loading: TableFallback },
);

interface DashboardOrdersViewProps {
  orderView: DashboardOrderView;
  /** Switch the lifecycle tab (Pending · Tested · Packed · Shipped) — writes the URL view flag. */
  onSelectView: (view: DashboardOrderView) => void;
  selectMode: boolean;
  selectionEnabled: boolean;
  /** Modal surfaces the bulk actions open (assignment carousel, ship-by picker). */
  selectionOverlays?: ReactNode;
}

/**
 * No `selectedRows` / `selectionActions` / `bulkBarVisible` here any more: the
 * capsule they fed is gone, and the rail reads the live selection from
 * `rail-actions-store` instead of taking it down the prop tree (the rail bodies
 * mount off the root layout, so there is no prop path). Publish lives in
 * `useOrderRailSelection`; `bulkBarVisible` still exists on
 * `useDashboardBulkSelection` for Pack / Shipping, which keep their capsule.
 */
export function DashboardOrdersView({
  orderView,
  onSelectView,
  selectMode,
  selectionEnabled,
  selectionOverlays,
}: DashboardOrdersViewProps) {
  const showOutboundChrome =
    isPrePackOrderView(orderView) || orderView === 'packed' || orderView === 'shipped';
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
      {/* Scroll body: KPI strip above the list. The strip STAYS — the table
          below is bounded (`workbenchTableViewportClass`) and owns Y scroll
          internally, so this body never grows with row count and the strip
          never slides under the chrome. Sticky layers live inside the grid's
          own port (column header at top-0, day-band headers), not here. */}
      <div className={showOutboundChrome ? WORKBENCH_BODY_COLUMN : 'relative flex min-w-0 flex-col'}>
        {showOutboundChrome ? (
          <div className="mb-4">
            <OutboundKpiStrip
              mode={
                orderView === 'packed' || orderView === 'shipped'
                  ? 'shipped'
                  : orderView === 'tested'
                    ? 'tested'
                    : 'unshipped'
              }
            />
          </div>
        ) : null}

        <div className="relative flex min-w-0 flex-col">
          <Suspense fallback={<div className="min-h-[240px] bg-surface-canvas" aria-hidden />}>
            {/* `railSelection`: on THIS display the check-set is the single
                selection SoT and the right rail is the selection plane — one
                row selected opens the inspector on it. The same tables render
                without it on Pack / Support / Shipping, which still run the
                bottom capsule. Plan: docs/todo/order-rail-selection-plane-PLAN.md */}
            {orderView === 'shipped' ? (
              <DashboardShippedTable
                selectMode={selectMode}
                railSelection
                toolbarPortalTarget={outboundControlsEl}
              />
            ) : orderView === 'packed' ? (
              <PackedOrdersTable
                selectMode={selectMode}
                railSelection
                toolbarPortalTarget={outboundControlsEl}
              />
            ) : (
              <UnshippedTable
                strictSearchScope
                selectMode={selectMode}
                railSelection
                toolbarPortalTarget={outboundControlsEl}
                fulfillmentLane={orderView === 'tested' ? 'tested' : 'pending'}
              />
            )}
          </Suspense>
        </div>
      </div>

      {/* No bottom capsule on this display (plan D2). The right rail IS the
          selection plane: 1 row opens the inspector, whose footer carries
          `RailActionRegion`; 2+ open `OrderRailShell`. `selectionOverlays`
          stays — Assign is a per-record carousel and remains a modal the rail
          launches.

          The two earlier reverts were both caused by the region being mounted
          on `ShippedDetailsPanel`'s `isOrderRecord` branch: the Pending/Tested
          lanes open with the FULFILLMENT context, so it rendered on no
          dashboard lane and a selection had zero actions once the capsule went
          away. That mount now sits above the branch split, verified against the
          QA org — one checked row renders Copy details / Export CSV / … in the
          inspector footer. Re-check THAT before ever restoring this capsule.
          Plan: docs/todo/order-rail-selection-plane-PLAN.md (D1, D2). */}
      {selectionEnabled ? (
        <>
          {/* Cardinality picks exactly one of these (`selection-occupancy.ts`):
              1 row → the inspector's own footer, 2 → compare, 3+ → the roster.
              Both registrars gate on `isRailOccupantActive`, so mounting them
              side by side never puts two claims on the single rail slot. */}
          <OrderRailCompare />
          <OrderRailShell />
          {selectionOverlays}
        </>
      ) : null}
    </DashboardScrollShell>
  );
}
