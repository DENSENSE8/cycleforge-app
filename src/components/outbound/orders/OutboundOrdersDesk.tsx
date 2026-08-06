'use client';

/**
 * Outbound orders desk body — Pending · Tested · Packed · Shipped.
 *
 * Mounted at `/shipping/orders` (canonical) and briefly at `/dashboard` only
 * while client redirects drain. Support › Inquiries aliases here with
 * `?context=support` and swaps the focus pane for ticket affordances.
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
import { useOrderRailSelection } from '@/hooks/useOrderRailSelection';
import { useDashboardViewWarmup } from '@/hooks/useDashboardViewWarmup';
import { useDashboardRealtime } from '@/hooks/useDashboardRealtime';
import { DashboardOrdersView } from '@/components/dashboard/DashboardOrdersView';
import { DashboardOrderDetails } from '@/components/dashboard/DashboardOrderDetails';
import { OrdersViewChromeProvider } from '@/components/outbound/orders/orders-view-chrome-context';
import { SupportOrdersFocusHost } from '@/components/support/orders/SupportOrdersFocusHost';
import {
  ORDERS_DESK_CONTEXT_KEY,
  ORDERS_DESK_SUPPORT_CONTEXT,
  applyOrdersDeskContext,
  isDashboardOutboundOrdersUrl,
  parseOrdersDeskContext,
  type OrdersDeskContext,
  SHIPPING_ORDERS_PATH,
} from '@/lib/shipping/orders-desk';
import { refreshDomain } from '@/lib/refresh/bus';

function OutboundOrdersDeskContent({
  onPrimaryPainted,
}: {
  onPrimaryPainted?: () => void;
}) {
  const searchParams = useSearchParams();
  const context: OrdersDeskContext = parseOrdersDeskContext(
    searchParams.get(ORDERS_DESK_CONTEXT_KEY),
  );
  const isSupportContext = context === ORDERS_DESK_SUPPORT_CONTEXT;
  const { detailsEnabled, orderView, searchQuery, setOrderView } =
    useDashboardSearchController();

  const { selectionEnabled, selectMode, selectionOverlays } =
    useOrderRailSelection(orderView);

  const { selectedShipped, selectedContext, requestCloseSelectedOrder } =
    useDashboardSelectedOrder(detailsEnabled && !isSupportContext);

  useDashboardRealtime();
  useDashboardViewWarmup({ orderView, searchQuery, enabled: true });

  const refreshDashboard = useCallback(() => {
    refreshDomain('orders.outbound');
  }, []);

  // Support context: Station focus replaces the slide-in details panel when an
  // order is open (`?openOrderId=`). Board stays DashboardOrdersView SoT.
  if (isSupportContext) {
    const openOrderId = Number(searchParams.get('openOrderId')) || null;
    if (openOrderId) {
      return (
        <div className="flex min-h-0 w-full flex-1">
          <SupportOrdersFocusHost openOrderId={openOrderId} />
        </div>
      );
    }
  }

  return (
    <OrdersViewChromeProvider>
      <div className="flex min-h-0 w-full flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <DashboardOrdersView
            orderView={orderView}
            onSelectView={setOrderView}
            selectMode={selectMode}
            selectionEnabled={selectionEnabled}
            selectionOverlays={selectionOverlays}
            onPrimaryPainted={onPrimaryPainted}
          />
        </div>

        {!isSupportContext ? (
          <DashboardOrderDetails
            detailsEnabled={detailsEnabled}
            selectedShipped={selectedShipped}
            selectedContext={selectedContext}
            onClose={requestCloseSelectedOrder}
            onUpdate={refreshDashboard}
          />
        ) : null}
      </div>
    </OrdersViewChromeProvider>
  );
}

function OutboundOrdersBootGate({ children }: { children: React.ReactNode }) {
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

/**
 * Client redirect shell when something still soft-navigates to bare `/dashboard`
 * outbound. Proxy also 308s; this covers in-app navigations that skip the edge.
 */
export function RedirectDashboardOutboundToShippingOrders() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Soft navigations can land on bare `/dashboard` outbound — same gate as
    // the edge 308 (`isDashboardOutboundOrdersUrl`).
    if (
      !isDashboardOutboundOrdersUrl(
        typeof window !== 'undefined' ? window.location.pathname : '/dashboard',
        searchParams,
      )
    ) {
      return;
    }
    const next = applyOrdersDeskContext(searchParams, null);
    next.delete('mode');
    const qs = next.toString();
    router.replace(qs ? `${SHIPPING_ORDERS_PATH}?${qs}` : SHIPPING_ORDERS_PATH);
  }, [router, searchParams]);

  return <div className="flex h-full w-full bg-surface-canvas" aria-busy />;
}

export function OutboundOrdersDesk({
  onPrimaryPainted,
}: {
  /** Fired once the Unshipped (or active) primary table has paintable rows. */
  onPrimaryPainted?: () => void;
} = {}) {
  return (
    <Suspense fallback={<BootSplash />}>
      <OutboundOrdersBootGate>
        <OutboundOrdersDeskContent onPrimaryPainted={onPrimaryPainted} />
      </OutboundOrdersBootGate>
    </Suspense>
  );
}
