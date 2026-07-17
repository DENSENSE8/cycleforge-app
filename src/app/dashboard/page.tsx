'use client';

/**
 * Dashboard page — thin composition layer.
 *
 * Logic lives in focused hooks:
 *   - useDashboardSearchController .. URL ⇄ active view + search (existing)
 *   - useDashboardSelectedOrder ..... selected order + details context (existing)
 *   - useDashboardBulkSelection ..... pencil multi-select + Copy/Print/Delete
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
import { consumeBootSplash } from '@/lib/boot-flag';
import { warmActiveView } from '@/lib/queries/dashboard-warm';
import { useDashboardSearchController } from '@/hooks/useDashboardSearchController';
import { useDashboardSelectedOrder } from '@/hooks/useDashboardSelectedOrder';
import { useDashboardBulkSelection } from '@/hooks/useDashboardBulkSelection';
import { useDashboardViewWarmup } from '@/hooks/useDashboardViewWarmup';
import { useDashboardRealtime } from '@/hooks/useDashboardRealtime';
import { DashboardOrdersView } from '@/components/dashboard/DashboardOrdersView';
import { DashboardInboundView } from '@/components/dashboard/DashboardInboundView';
import { DashboardOrderDetails } from '@/components/dashboard/DashboardOrderDetails';
import { buildSupportWarrantyRedirectSearch } from '@/utils/dashboard-search-state';
import { getDashboardDomainFromSearch } from '@/lib/dashboard/dashboard-domains';

function DashboardPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const domain = getDashboardDomainFromSearch(searchParams);
  const { detailsEnabled, orderView, searchQuery, setOrderView } = useDashboardSearchController();

  // Legacy Warranty Logger lived on `/dashboard?warranty=` — permanent home is
  // Support › Warranty. Preserve open claim + filters for bookmarks / e2e.
  useEffect(() => {
    if (!searchParams.has('warranty')) return;
    const qs = buildSupportWarrantyRedirectSearch(searchParams);
    router.replace(qs ? `/support?${qs}` : '/support?mode=warranty');
  }, [router, searchParams]);

  const isInbound = domain === 'inbound';

  const { selectionEnabled, selectMode, toggleSelectMode, selectedRows, selectionActions } =
    useDashboardBulkSelection(orderView);

  // Inbound rows are cartons, not orders — never resolve/open the order panel there.
  const { selectedShipped, selectedContext, requestCloseSelectedOrder } =
    useDashboardSelectedOrder(detailsEnabled && !isInbound);

  useDashboardRealtime();
  useDashboardViewWarmup({ orderView, searchQuery, enabled: !isInbound });

  const refreshDashboard = useCallback(() => {
    window.dispatchEvent(new CustomEvent('dashboard-refresh'));
  }, []);

  if (searchParams.has('warranty')) {
    return <div className="flex h-full w-full bg-surface-canvas" aria-busy />;
  }

  // Inbound (`?mode=inbound`) is the other dashboard domain — receiving cartons.
  // It owns its whole region (own chrome + own table) and never mounts the
  // outbound order panel, so the two domains can't intermix rows.
  if (isInbound) {
    return (
      <div className="flex min-h-0 w-full flex-1">
        <DashboardInboundView />
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
        onToggleSelectMode={toggleSelectMode}
        selectionEnabled={selectionEnabled}
        selectedRows={selectedRows}
        selectionActions={selectionActions}
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
    <Suspense fallback={<BootSplash />}>
      <DashboardBootGate>
        <DashboardPageContent />
      </DashboardBootGate>
    </Suspense>
  );
}
