'use client';

/** Outbound orders desk body — Pending · Picked · Packed · Shipped. */

import { Suspense, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';

import { useDashboardSearchController } from '@/hooks/useDashboardSearchController';
import { useDashboardSelectedOrder } from '@/hooks/useDashboardSelectedOrder';
import { useOrderRailSelection } from '@/hooks/useOrderRailSelection';
import { useDashboardViewWarmup } from '@/hooks/useDashboardViewWarmup';
import { useDashboardRealtime } from '@/hooks/useDashboardRealtime';
import { useSupportOrderOpenParam } from '@/hooks/useSupportOrderOpenParam';
import { DashboardOrdersView } from '@/components/dashboard/DashboardOrdersView';
import { OrdersViewChromeProvider } from '@/components/outbound/orders/orders-view-chrome-context';
import { OrderIntakeEntry } from '@/components/outbound/orders/intake/OrderIntakeEntry';
import { OrderListLeadProvider } from '@/components/outbound/orders/intake/order-list-lead';

import { OrderPasteIntake } from '@/components/outbound/orders/OrderPasteIntake';
import { useTableImportParam } from '@/hooks/useTableImportParam';
import { useTableImportFilePicker } from '@/components/tables/import/TableImportFileButton';

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
import { getOpenShippedDetailsPayload } from '@/utils/events';
import { useNavIntent } from '@/lib/nav/use-nav-intent';

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
    bindTriageOrder,
  } = useDashboardSearchController();

  // CSV staging takes over the desk; intake steps aside while it runs — the
  // same courtesy the ingest rail has always paid (`ingestEnabled`), now
  // applied to the centered overlay so two intake surfaces never stack.
  const { active: importActive } = useTableImportParam(ORDER_IMPORT_DESCRIPTOR);

  /**
   * The one intake verb left on the desk's chevron: Upload orders CSV. Sync,
   * demo and test orders moved out (owner 2026-09-28) — syncing is the global
   * header Sync; its history is Operations › Sync.
   */
  const csv = useTableImportFilePicker(ORDER_IMPORT_DESCRIPTOR);
  const { has } = useAuth();
  const intake = !isSupportContext;
  const canUploadCsv = intake && has('orders.import') && csv.live;
  useNavIntent('orders-intake:file', canUploadCsv ? csv.open : null);

  const { selectionEnabled, selectionOverlays } =
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
    <OrdersViewChromeProvider>
    <OrderListLeadProvider
      lead={
        // The hand-entry intake opens INLINE at the top of the order list
        // (owner 2026-09-27: no dialog). The open record stays the ledger's own.
        !isSupportContext &&
        parsePaperworkOrderId(searchParams.get(PAPERWORK_PARAM)) == null &&
        showIngestRail &&
        ingestLeaf === 'triage' &&
        !importActive ? (
          <OrderIntakeEntry orderId={triageOrderId} onClose={closeIntakeForm} onOrderCreated={bindTriageOrder} />
        ) : null
      }
    >
      <DashboardOrdersView
        orderView={orderView}
        onSelectView={setOrderView}
        selectionEnabled={selectionEnabled}
        selectionOverlays={selectionOverlays}
        onPrimaryPainted={onPrimaryPainted}
      />
    </OrderListLeadProvider>
      {!isSupportContext ? (
        <>
          {/* The picker's hidden <input>; `csv.open()` (orders-intake:file) clicks it. */}
          {csv.input}
          {canUploadCsv ? <OrderPasteIntake /> : null}
        </>
      ) : null}
    </OrdersViewChromeProvider>
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
    <Suspense fallback={null}>
      <OutboundOrdersDeskContent onPrimaryPainted={onPrimaryPainted} />
    </Suspense>
  );
}
