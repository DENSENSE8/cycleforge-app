'use client';

/** Outbound orders desk body — Pending · Tested · Packed · Shipped. */

import { Suspense, useCallback, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
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
import { useOrdersSyncDemo } from '@/hooks/useOrdersSyncDemo';
import {
  OrdersSyncRunProvider,
  type OrdersSyncRunSurface,
} from '@/features/orders/sync/orders-sync-run-context';
import { syncRunProgress, syncRunRowsSeen } from '@/lib/orders-sync/run-steps';
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
import { safeRandomUUID } from '@/lib/safe-uuid';
import { toast } from '@/lib/toast';
import {
  insertUnshippedOrderIntoCache,
  invalidateUnshippedCounts,
} from '@/lib/queries/dashboard-cache-patch';

// Support › Inquiries only.
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
   * The Add-orders RAIL is gone (operator, 2026-08-31): every method it listed
   */
  const csv = useTableImportFilePicker(ORDER_IMPORT_DESCRIPTOR);
  const sync = useOrdersSync();
  const demo = useOrdersSyncDemo();
  const queryClient = useQueryClient();
  const { has } = useAuth();
  const canImportOrders = has('orders.import');

  const openIntakeMethod = useCallback(
    async (method: OrderIntakeMethod) => {
      if (method === 'sync') {
        void sync.handleTransfer();
        return;
      }
      if (method === 'demo') {
        demo.start();
        return;
      }
      if (method === 'test') {
        const idempotencyKey = safeRandomUUID();
        const testToken = safeRandomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
        const orderId = `CF-TEST-${Date.now()}-${testToken.slice(0, 6)}`;
        // The To ship query is intentionally label-scoped:
        const trackingNumber = `1Z999AA1${testToken}`;
        const response = await fetch('/api/orders/add', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify({
            orderId,
            productTitle: 'CycleForge test order',
            sku: 'CF-TEST',
            accountSource: 'Manual',
            condition: 'USED_A',
            quantity: '1',
            shippingTrackingNumber: trackingNumber,
            idempotencyKey,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) {
          toast.error(result.error || 'Could not add test order');
          return;
        }
        if (result.order) insertUnshippedOrderIntoCache(queryClient, result.order);
        invalidateUnshippedCounts(queryClient);
        refreshDomain('orders.outbound');
        toast.success(`Added test order ${orderId}`);
        return;
      }
      csv.open();
    },
    [csv, demo, queryClient, sync],
  );

  /** ONE run surface for the table to yield to. */
  const runSurface = useMemo<OrdersSyncRunSurface>(
    () =>
      demo.run
        ? {
            run: demo.run,
            elapsedMs: demo.elapsedMs,
            isRunning: demo.isRunning,
            outcome: demo.outcome,
            detail: demo.detail,
            demo: true,
            cancel: demo.cancel,
            dismiss: demo.dismiss,
          }
        : {
            run: sync.run,
            elapsedMs: sync.elapsedMs,
            isRunning: sync.isTransferring,
            outcome: sync.status,
            detail: sync.runDetail,
            demo: false,
            cancel: sync.handleCancelTransfer,
            dismiss: sync.dismissRun,
          },
    [
      demo.run,
      demo.elapsedMs,
      demo.isRunning,
      demo.outcome,
      demo.detail,
      demo.cancel,
      demo.dismiss,
      sync.run,
      sync.elapsedMs,
      sync.isTransferring,
      sync.status,
      sync.runDetail,
      sync.handleCancelTransfer,
      sync.dismissRun,
    ],
  );

  /**
   * The CTA face is the first place the operator looks after pressing, so it
   * carries the ledger position rather than an indefinite "Syncing…".
   */
  const syncProgressLabel = useMemo(() => {
    if (!sync.run || !sync.isTransferring) return null;
    const progress = syncRunProgress(sync.run);
    const rows = syncRunRowsSeen(sync.run);
    const position = `${progress.completed}/${progress.total}`;
    return rows > 0 ? `Syncing ${position} · ${rows} rows` : `Syncing ${position}`;
  }, [sync.run, sync.isTransferring]);

  const { selectionEnabled, selectMode, selectionOverlays } =
    useOrderRailSelection(orderView);

  // Keeps `?openOrderId=` and the open record in step (deep links, back/forward);
  // the record itself paints in the ledger's record plane (`OrderRecordView`).
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

  return (
    <OrdersSyncRunProvider value={runSurface}>
    <OrdersViewChromeProvider>
      <DashboardOrdersView
        orderView={orderView}
        onSelectView={setOrderView}
        selectMode={selectMode}
        selectionEnabled={selectionEnabled}
        selectionOverlays={selectionOverlays}
        onPrimaryPainted={onPrimaryPainted}
        stageOverlay={
          // The open record is the ledger's own (`OrderRecordView` through
          // `DeskRecordPlane`), never this slot or the right rail. The stage
          // only ever carries the hand-entry intake.
          !isSupportContext &&
          parsePaperworkOrderId(searchParams.get(PAPERWORK_PARAM)) == null &&
          showIngestRail &&
          ingestLeaf === 'triage' &&
          !importActive ? (
            <OrderIntakeOverlay
              open
              orderId={triageOrderId}
              onClose={closeIntakeForm}
              onOrderCreated={bindTriageOrder}
            />
          ) : null
        }
      />
      {/*
        The desk has no left column (its search · views live in the master nav);
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
            syncProgressLabel={syncProgressLabel}
          />
          <OrdersDeskPastImportsAction />
          {/* The picker's hidden <input>; `csv.open()` above clicks it. */}
          {csv.input}
          {canImportOrders && csv.live ? <OrderPasteIntake /> : null}
        </>
      ) : null}
    </OrdersViewChromeProvider>
    </OrdersSyncRunProvider>
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
