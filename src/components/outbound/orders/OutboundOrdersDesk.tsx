'use client';

/**
 * Outbound orders desk body — Pending · Tested · Packed · Shipped.
 *
 * Mounted at `/shipping/orders` (canonical) and briefly at `/dashboard` only
 * while client redirects drain. Support › Inquiries aliases here with
 * `?context=support` and swaps the focus pane for ticket affordances.
 */

import { Suspense, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
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
import { useSupportOrderOpenParam } from '@/hooks/useSupportOrderOpenParam';
import { DashboardOrdersView } from '@/components/dashboard/DashboardOrdersView';
import { DashboardOrderDetails } from '@/components/dashboard/DashboardOrderDetails';
import { OrdersViewChromeProvider } from '@/components/outbound/orders/orders-view-chrome-context';
import { OrderIntakeOverlay } from '@/components/outbound/orders/intake/OrderIntakeOverlay';
import {
  OrdersDeskAddAction,
  type OrderIntakeMethod,
} from '@/components/outbound/orders/OrdersDeskAddAction';
import { OrdersDeskPastImportsAction } from '@/components/outbound/orders/OrdersDeskPastImportsAction';
import { OrderPasteIntake } from '@/components/outbound/orders/OrderPasteIntake';
import { useTableImportParam } from '@/hooks/useTableImportParam';
import { useTableImportFilePicker } from '@/components/tables/import/TableImportFileButton';
import { useOrdersSync } from '@/hooks/useOrdersSync';
import { useAuth } from '@/contexts/AuthContext';
import { ORDER_IMPORT_DESCRIPTOR } from '@/lib/orders/order-import-descriptor';
import { PAPERWORK_PARAM, parsePaperworkOrderId } from '@/lib/orders/print-packet';
import { UniversalLoader } from '@/design-system/components/UniversalLoader';
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
import { getOpenShippedDetailsPayload } from '@/utils/events';

// Support › Inquiries only. This host mounts behind TWO url params
// (`?context=support` + `?openOrderId=`) and never on the default
// `/shipping/orders` paint, but a static import anchored the whole support
// station graph — EntityStationPane, the Displays registry, the Zendesk ticket
// hub — into the desk's first-load chunk. `ssr: false` for the same reason
// `UnboxWorkspaceView` opts out behind `?unboxdesk=1`: it is a client-only
// branch already gated on a URL selection, so it is never this route's LCP
// surface. The fallback stands in for the host's own "Loading order…" state,
// which is what the operator saw here before the split.
const SupportOrdersFocusHost = dynamic(
  () =>
    import('@/components/support/orders/SupportOrdersFocusHost').then(
      (m) => m.SupportOrdersFocusHost,
    ),
  { ssr: false, loading: () => <UniversalLoader isLoading label="Loading order" /> },
);

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
  const {
    detailsEnabled,
    orderView,
    searchQuery,
    setOrderView,
    showIngestRail,
    ingestLeaf,
    triageOrderId,
    closeIntakeForm,
    openTriage,
    bindTriageOrder,
  } = useDashboardSearchController();

  // Stable identity so `OrdersDeskAddAction` does not re-register its node on
  // every desk render (the registrar keys on the node it is handed).
  const openTriageForNewOrder = useCallback(() => openTriage(null), [openTriage]);

  // CSV staging takes over the desk; intake steps aside while it runs — the
  // same courtesy the ingest rail has always paid (`ingestEnabled`), now
  // applied to the centered overlay so two intake surfaces never stack.
  const { active: importActive } = useTableImportParam(ORDER_IMPORT_DESCRIPTOR);

  /**
   * Ingest, run straight from the desk CTA.
   *
   * The Add-orders RAIL is gone (operator, 2026-08-31): every method it listed
   * is already an item on the CTA, so the rail was a second front door whose
   * only job was hosting a button per method. Each method now does its own work
   * here — and each one needed no host to begin with:
   *
   * - **sync** — `useOrdersSync().handleTransfer()`. The CTA's own face reports
   *   it (`syncing` → "Syncing…" + spinner), which is why that prop existed and
   *   went unwired while the rail owned the progress.
   * - **file** — the OS file picker; CSV staging then takes over the desk. The
   *   rail leaf was one `Choose CSV` button in front of exactly this call.
   *
   * Hand entry is the centered `OrderIntakeOverlay` (`onAdd`), which has been
   * the acknowledgment intake's front door since 2026-08-30 — so the rail's
   * `manual` leaf was the SECOND hand-entry path, not the only one.
   */
  const csv = useTableImportFilePicker(ORDER_IMPORT_DESCRIPTOR);
  const sync = useOrdersSync();
  const { has } = useAuth();
  const canImportOrders = has('orders.import');

  const openIntakeMethod = useCallback(
    (method: OrderIntakeMethod) => {
      if (method === 'sync') {
        void sync.handleTransfer();
        return;
      }
      csv.open();
    },
    [csv, sync],
  );

  const { selectionEnabled, selectMode, selectionOverlays } =
    useOrderRailSelection(orderView);

  const { selectedShipped, selectedContext, requestCloseSelectedOrder } =
    useDashboardSelectedOrder(detailsEnabled && !isSupportContext);

  const { openOrderId, setOpenOrderId } = useSupportOrderOpenParam(isSupportContext);

  // Support desk: queue row clicks dispatch `open-shipped-details`, but the
  // dashboard sync-guard is off — write paint-pending openOrderId instead.
  useEffect(() => {
    if (!isSupportContext) return;
    const onOpen = (e: Event) => {
      const payload = getOpenShippedDetailsPayload((e as CustomEvent).detail);
      const id = Number(payload?.order?.id);
      if (Number.isFinite(id) && id > 0) setOpenOrderId(id);
    };
    window.addEventListener('open-shipped-details', onOpen as EventListener);
    return () => window.removeEventListener('open-shipped-details', onOpen as EventListener);
  }, [isSupportContext, setOpenOrderId]);

  useDashboardRealtime();
  useDashboardViewWarmup({ orderView, searchQuery, enabled: true });

  const refreshDashboard = useCallback(() => {
    refreshDomain('orders.outbound');
  }, []);

  // Support context: Station focus replaces the slide-in details panel when an
  // order is open (`?openOrderId=`). Board stays DashboardOrdersView SoT.
  if (isSupportContext && openOrderId) {
    return (
      <div className="flex min-h-0 w-full flex-1">
        <SupportOrdersFocusHost
          openOrderId={openOrderId}
          onClear={() => setOpenOrderId(null)}
        />
      </div>
    );
  }

  const intakeOpen =
    !isSupportContext && showIngestRail && ingestLeaf === 'triage' && !importActive;
  const paperworkOpen =
    parsePaperworkOrderId(searchParams.get(PAPERWORK_PARAM)) != null;

  return (
    <OrdersViewChromeProvider>
      <DashboardOrdersView
        orderView={orderView}
        onSelectView={setOrderView}
        selectMode={selectMode}
        selectionEnabled={selectionEnabled}
        selectionOverlays={selectionOverlays}
        onPrimaryPainted={onPrimaryPainted}
        stageOverlay={
          !isSupportContext && !paperworkOpen ? (
            intakeOpen ? (
              <OrderIntakeOverlay
                open
                orderId={triageOrderId}
                onClose={closeIntakeForm}
                onOrderCreated={bindTriageOrder}
              />
            ) : (
              <DashboardOrderDetails
                detailsEnabled={detailsEnabled}
                selectedShipped={selectedShipped}
                selectedContext={selectedContext}
                onClose={requestCloseSelectedOrder}
                onUpdate={refreshDashboard}
              />
            )
          ) : null
        }
      />
      {/*
        Pattern E (rail-less) does not mount OutboundSidebarPanel on desktop —
        desk owns Add / ingest / ?new=true so Band-1 Add always has a host.
      */}
      {/*
        Support › Inquiries aliases this desk; it is a ticket surface, not the
        intake, so it gets neither the Add CTA nor the ingest rail.
      */}
      {!isSupportContext ? (
        <>
          <OrdersDeskAddAction
            onAdd={openTriageForNewOrder}
            onMethod={openIntakeMethod}
            canImport={canImportOrders && csv.live}
            syncing={sync.isTransferring}
          />
          {/* Collection action (`role="overall"`), left of Sync — reading the
              record is not an intake verb, so it is not a menu row under one. */}
          <OrdersDeskPastImportsAction />
          {/* The picker's hidden <input>; `csv.open()` above clicks it. */}
          {csv.input}
          {/* Paste / drop a screenshot or CSV onto the mouth → the same draft
              the picker builds. Mount-only; nothing painted. */}
          {canImportOrders && csv.live ? <OrderPasteIntake /> : null}
        </>
      ) : null}
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
