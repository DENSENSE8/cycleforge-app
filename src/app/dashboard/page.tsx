'use client';

/**
 * Dashboard page — thin composition layer.
 *
 * Logic lives in focused hooks:
 *   - useDashboardSearchController .. URL ⇄ active view + search (existing)
 *   - useDashboardSelectedOrder ..... selected order + details context (existing)
 *   - useDashboardBulkSelection ..... always-on multi-select + Copy/Print/Delete
 *   - useDashboardViewWarmup ........ React Query prefetch warm-up
 *   - useDashboardRealtime .......... realtime invalidation + toasts
 *
 * Render is pure composition: <DashboardOrdersView> (table + selection bar) and
 * <DashboardOrderDetails> (the slide-in panel). The sign-in BootGate reuses the
 * shared `warmActiveView` warm-up so the splash holds until data is painted.
 */

import { Suspense, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { QueryClient } from '@tanstack/react-query';
import { BootGate } from '@/components/boot/BootGate';
import { BootSplash } from '@/components/boot/BootSplash';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { consumeBootSplash } from '@/lib/boot-flag';
import { warmActiveView } from '@/lib/queries/dashboard-warm';
import { useDashboardSearchController } from '@/hooks/useDashboardSearchController';
import { useDashboardSelectedOrder } from '@/hooks/useDashboardSelectedOrder';
import { useDashboardBulkSelection } from '@/hooks/useDashboardBulkSelection';
import { useDashboardViewWarmup } from '@/hooks/useDashboardViewWarmup';
import { useDashboardRealtime } from '@/hooks/useDashboardRealtime';
import { DashboardOrdersView } from '@/components/dashboard/DashboardOrdersView';
import { DashboardReceivingView } from '@/components/dashboard/receiving/DashboardReceivingView';
import { DashboardSalesView } from '@/components/dashboard/DashboardSalesView';
import { DashboardOrderDetails } from '@/components/dashboard/DashboardOrderDetails';
import { buildSupportWarrantyRedirectSearch } from '@/utils/dashboard-search-state';
import {
  getDashboardDomainFromSearch,
  isRetiredFbaView,
  isRetiredSearchMode,
  retiredFbaViewTarget,
  retiredSearchModeTarget,
} from '@/lib/dashboard/dashboard-domains';
import { refreshDomain } from '@/lib/refresh/bus';

function DashboardPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const domain = getDashboardDomainFromSearch(searchParams);
  const searchModeRetired = isRetiredSearchMode(searchParams);
  const fbaViewRetired = isRetiredFbaView(searchParams);
  const { detailsEnabled, orderView, searchQuery, setOrderView } = useDashboardSearchController();

  // Legacy Warranty Logger lived on `/dashboard?warranty=` — permanent home is
  // Support › Warranty. Preserve open claim + filters for bookmarks / e2e.
  useEffect(() => {
    if (!searchParams.has('warranty')) return;
    const qs = buildSupportWarrantyRedirectSearch(searchParams);
    router.replace(qs ? `/support?${qs}` : '/support?mode=warranty');
  }, [router, searchParams]);

  // Retired `?fba` lifecycle tab — FBA's home is `/shipping/fba` (IA row L).
  // Deleting the view member alone let an old bookmark fall through to Pending;
  // this sends it where FBA actually lives. Third instance of the same mechanism.
  useEffect(() => {
    if (!fbaViewRetired) return;
    router.replace(retiredFbaViewTarget());
  }, [router, fbaViewRetired]);

  // Retired Search mode (`?mode=search`) — same client-redirect mechanism as
  // `?warranty=` above, for the same reason: Next `redirects()` emits 308 and
  // cannot drop `mode` while preserving `q`.
  useEffect(() => {
    if (!searchModeRetired) return;
    router.replace(retiredSearchModeTarget(searchParams));
  }, [router, searchModeRetired, searchParams]);

  const isOutbound = domain === 'outbound';

  const {
    selectionEnabled,
    selectMode,
    selectedRows,
    selectionActions,
    selectionOverlays,
    bulkBarVisible,
  } = useDashboardBulkSelection(orderView);

  // Only the outbound (Shipping) mode resolves/opens the order panel — receiving
  // rows are cartons, sales rows are transactions, and search rows are hits.
  const { selectedShipped, selectedContext, requestCloseSelectedOrder } =
    useDashboardSelectedOrder(detailsEnabled && isOutbound);

  useDashboardRealtime();
  useDashboardViewWarmup({ orderView, searchQuery, enabled: isOutbound });

  const refreshDashboard = useCallback(() => {
    refreshDomain('orders.outbound');
  }, []);

  if (searchParams.has('warranty') || searchModeRetired || fbaViewRetired) {
    return <div className="flex h-full w-full bg-surface-canvas" aria-busy />;
  }

  // Inbound (`?mode=inbound`) is the receiving-cartons domain — Triage/Unbox
  // table tabs. It owns its whole region (own chrome + own table) and never
  // mounts the outbound order panel, so the two domains can't intermix rows.
  if (domain === 'inbound') {
    return (
      <div className="flex min-h-0 w-full flex-1">
        <DashboardReceivingView />
      </div>
    );
  }

  // Sales (`?mode=sales` | `?mode=pickup`) — front-desk transaction history.
  // Same isolation: own region, no order panel.
  if (domain === 'sales') {
    return (
      <div className="flex min-h-0 w-full flex-1">
        <DashboardSalesView />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <DashboardOrdersView
        orderView={orderView}
        onSelectView={setOrderView}
        selectMode={selectMode}
        selectionEnabled={selectionEnabled}
        selectedRows={selectedRows}
        selectionActions={selectionActions}
        selectionOverlays={selectionOverlays}
        bulkBarVisible={bulkBarVisible}
        />
      </div>

      <DashboardOrderDetails
        detailsEnabled={detailsEnabled}
        selectedShipped={selectedShipped}
        selectedContext={selectedContext}
        onClose={requestCloseSelectedOrder}
        onUpdate={refreshDashboard}
      />
    </div>
  );
}

/**
 * Wraps the dashboard in a single sign-in loading splash. On a fresh sign-in
 * (flag armed by /signin), the splash holds while the active view's data is
 * warmed, then reveals the page fully painted. On refreshes / in-app
 * navigations the gate reveals immediately, so it never lingers.
 */
function DashboardBootGate({ children }: { children: React.ReactNode }) {
  const prefetch = useCallback(
    (queryClient: QueryClient) => warmActiveView(queryClient, window.location.search),
    [],
  );
  return (
    <BootGate prefetch={prefetch} shouldHold={consumeBootSplash} splash={<BootSplash />}>
      {children}
    </BootGate>
  );
}

export default function DashboardPage() {
  return (
    <>
      {/* Leaf route — page is the always-mounted host (see SurfaceParamHygiene). */}
      <SurfaceParamHygiene />
      <Suspense fallback={<BootSplash />}>
        <DashboardBootGate>
          <DashboardPageContent />
        </DashboardBootGate>
      </Suspense>
    </>
  );
}
