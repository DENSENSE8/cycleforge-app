'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  getOrdersChannelName,
  getRepairsChannelName,
  getStationChannelName,
  getWalkInChannelName,
  safeChannelName,
} from '@/lib/realtime/channels';
import { useAblyClient } from '@/contexts/AblyContext';
import { useAblyChannel } from './useAblyChannel';
import { useAuth } from '@/contexts/AuthContext';
import { qk } from '@/queries/keys';
import { invalidateQueryKeys, ORDER_WRITE_QUERY_KEYS } from '@/lib/refresh/query-keys';
import { receivingFeedsRecentlyInvalidatedLocally } from '@/lib/queries/receiving-queries';
import {
  invalidateUnshippedCounts,
  patchUnshippedOrderPicked,
} from '@/lib/queries/dashboard-cache-patch';
import { optimisticallyRemoveOrderRows } from '@/lib/queries/order-cache-optimistic';
import { publishOutboundRealtimePaintReceipt } from '@/lib/shipping/outbound-realtime-paint';

/** The caches an order-row mutation has to refresh — the same set a local `orders.outbound` write busts. */
function invalidateOrderDashboards(queryClient: QueryClient) {
  invalidateQueryKeys(queryClient, ORDER_WRITE_QUERY_KEYS);
}

/**
 * Ably hands the subscriber an envelope whose `data` is whatever the publisher
 * sent (see `src/lib/realtime/publish.ts`). Unwrap it to a checked record so
 * handlers can read payload fields without widening to `any`.
 */
function readEventData(message: unknown): Record<string, unknown> {
  if (typeof message !== 'object' || message === null || !('data' in message)) return {};
  const data = message.data;
  return typeof data === 'object' && data !== null ? { ...data } : {};
}

/**
 * Publishers put the discriminator on `data.source`; a few legacy senders put
 * it on the envelope itself. Read both.
 */
function readEventSource(message: unknown): string {
  const source = readEventData(message).source;
  if (source != null) return String(source);
  if (
    typeof message === 'object' &&
    message !== null &&
    'source' in message &&
    message.source != null
  ) {
    return String(message.source);
  }
  return '';
}

interface UseRealtimeInvalidationOptions {
  dashboard?: boolean;
  repair?: boolean;
  receiving?: boolean;
  walkIn?: boolean;
  /** Register a connection listener that invalidates *all* dashboard caches when the Ably realtime client reconnects after a disconnect (e.g. */
  reconnect?: boolean;
}

export function useRealtimeInvalidation({
  dashboard = false,
  repair = false,
  receiving = false,
  walkIn = false,
  reconnect = false,
}: UseRealtimeInvalidationOptions = {}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const ordersChannel = safeChannelName(() => getOrdersChannelName(orgId!));
  const repairsChannel = safeChannelName(() => getRepairsChannelName(orgId!));
  // Global per-org station broadcast (receiving/shipment row changes) — NOT a
  // per-staff bridge.
  const stationChannel = safeChannelName(() => getStationChannelName(orgId!));
  const walkInChannel = safeChannelName(() => getWalkInChannelName(orgId!));

  const frameCoalesce = { coalesce: 'frame' as const };

  useAblyChannel(
    ordersChannel,
    'order.changed',
    (message: unknown) => {
      const data = readEventData(message);
      const source = readEventSource(message);
      const orderIds = Array.isArray(data.orderIds)
        ? data.orderIds.map(Number).filter((id) => Number.isFinite(id) && id > 0)
        : [];
      if (source === 'orders.delete' || source === 'shipping.scan-out') {
        optimisticallyRemoveOrderRows(queryClient, orderIds);
      }
      // `orders.add` fires after the durable write.
      if (source === 'orders.add') {
        invalidateOrderDashboards(queryClient);
        return;
      }
      // Everything else (pack scans, `pick.scan`, tracking edits…) repaints the
      // full desk.
      invalidateOrderDashboards(queryClient);
    },
    !!ordersChannel && dashboard,
    frameCoalesce,
  );

  // Assignment changes can patch one table in-place, but other dashboard
  // caches (including alternate filters/views) still need a refetch.
  useAblyChannel(
    ordersChannel,
    'order.assignments',
    () => invalidateOrderDashboards(queryClient),
    !!ordersChannel && dashboard,
    frameCoalesce,
  );

  useAblyChannel(
    ordersChannel,
    'queue.assignments',
    () => invalidateOrderDashboards(queryClient),
    !!ordersChannel && dashboard,
    frameCoalesce,
  );

  // The picker desk's tracking scan publishes order.picked (not order.changed).
  // Invalidate shipped views so the details panel stays current.
  useAblyChannel(
    ordersChannel,
    'order.picked',
    () => {
      // The Unshipped rows are patched IN PLACE by the sibling subscription below (has_pick_scan → the row moves pending → picked); only the counts and shipped views refetch here.
      invalidateUnshippedCounts(queryClient);
      queryClient.invalidateQueries({ queryKey: ['dashboard-table', 'shipped'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-table', 'shipped-fba'] });
      queryClient.invalidateQueries({ queryKey: ['shipped-table'] });
      queryClient.invalidateQueries({ queryKey: ['shipped-table-fba'] });
    },
    !!ordersChannel && dashboard,
    frameCoalesce,
  );

  // …and the in-place half, as its OWN subscription.
  useAblyChannel(
    ordersChannel,
    'order.picked',
    (message: unknown) => {
      const data = readEventData(message);
      // Invisible measurement seam: browser harnesses time this receipt to the
      // patched row's next paint. It never renders connection-health chrome.
      publishOutboundRealtimePaintReceipt(data.orderId);
      patchUnshippedOrderPicked(queryClient, {
        orderId: data.orderId,
        picked: data.picked,
        pickedBy: data.pickedBy,
        pickedByName: data.pickedByName,
        pickedAt: data.pickedAt,
        packLocationId: data.packLocationId,
        packLocationName: data.packLocationName,
      });
    },
    !!ordersChannel && dashboard,
  );

  useAblyChannel(
    repairsChannel,
    'repair.changed',
    () => {
      queryClient.invalidateQueries({ queryKey: qk.repairs.all });
    },
    !!repairsChannel && repair,
    frameCoalesce,
  );

  useAblyChannel(
    stationChannel,
    'receiving-log.changed',
    () => {
      // The Ably echo of a LOCAL scan/receive arrives just after this client already ran invalidateReceivingFeeds optimistically.
      const localCovered = receivingFeedsRecentlyInvalidatedLocally();
      if (!localCovered) queryClient.invalidateQueries({ queryKey: ['receiving'] });
      queryClient.invalidateQueries({ queryKey: ['receiving-pending-unboxing'] });
      if (!localCovered) queryClient.invalidateQueries({ queryKey: ['receiving-lines-table'] });
      // 'receiving-logs' is intentionally omitted:
      queryClient.invalidateQueries({ queryKey: ['receiving-lines'] });
      queryClient.invalidateQueries({ queryKey: ['receiving-lines-with-serials'] });
      queryClient.invalidateQueries({ queryKey: ['receiving-line-serials'] });
      // Mobile pipeline (/m/receiving) — PO-grouped list, PO detail, photos.
      queryClient.invalidateQueries({ queryKey: ['receiving-po-list'] });
      queryClient.invalidateQueries({ queryKey: ['receiving-po-detail'] });
      queryClient.invalidateQueries({ queryKey: ['receiving-photos'] });
      queryClient.invalidateQueries({ queryKey: ['receiving-item-photos'] });
    },
    !!stationChannel && receiving,
    frameCoalesce,
  );

  useAblyChannel(
    stationChannel,
    'receiving-photo.changed',
    () => {
      queryClient.invalidateQueries({ queryKey: ['receiving-photos'] });
      queryClient.invalidateQueries({ queryKey: ['receiving-lines-table'] });
      queryClient.invalidateQueries({ queryKey: ['receiving-lines'] });
      queryClient.invalidateQueries({ queryKey: ['receiving-po-list'] });
      queryClient.invalidateQueries({ queryKey: ['receiving-po-detail'] });
      queryClient.invalidateQueries({ queryKey: ['receiving-item-photos'] });
    },
    !!stationChannel && receiving,
    frameCoalesce,
  );

  // Carrier tracking status changed (webhook push or sync poll).
  useAblyChannel(
    stationChannel,
    'shipment.changed',
    () => {
      queryClient.invalidateQueries({ queryKey: ['receiving-lines-table'] });
      queryClient.invalidateQueries({ queryKey: ['nav-facets'] });
      queryClient.invalidateQueries({ queryKey: ['incoming-details'] });
    },
    !!stationChannel && receiving,
    frameCoalesce,
  );

  useAblyChannel(
    walkInChannel,
    'sale.completed',
    () => {
      queryClient.invalidateQueries({ queryKey: qk.walkInSales.all });
    },
    !!walkInChannel && walkIn,
    frameCoalesce,
  );

  // ─── Reconnect listener ──────────────────────────────────────────────── Events published while the realtime client is disconnected are…
  const { getClient } = useAblyClient();
  const wasDisconnectedRef = useRef(false);

  useEffect(() => {
    if (!reconnect) return;
    let disposed = false;
    let listener: ((stateChange: { current: string; previous: string }) => void) | null = null;
    let client: { connection: { on: (fn: typeof listener) => void; off: (fn: typeof listener) => void } } | null = null;

    getClient()
      .then((c) => {
        if (disposed || !c) return;
        client = c as typeof client;
        listener = (stateChange) => {
          const { current } = stateChange;
          if (current === 'disconnected' || current === 'suspended') {
            wasDisconnectedRef.current = true;
          }
          if (current === 'connected' && wasDisconnectedRef.current) {
            wasDisconnectedRef.current = false;
            console.warn('[ably] Reconnected after disconnect — invalidating dashboard caches');
            queryClient.invalidateQueries({ queryKey: ['dashboard-table'] });
            queryClient.invalidateQueries({ queryKey: ['shipped-table'] });
            queryClient.invalidateQueries({ queryKey: ['shipped-table-fba'] });
            queryClient.invalidateQueries({ queryKey: ['fba-board'] });
            queryClient.invalidateQueries({ queryKey: ['fba-shipments'] });
            queryClient.invalidateQueries({ queryKey: qk.repairs.all });
            queryClient.invalidateQueries({ queryKey: ['receiving'] });
            queryClient.invalidateQueries({ queryKey: ['receiving-pending-unboxing'] });
            queryClient.invalidateQueries({ queryKey: ['receiving-lines-table'] });
            queryClient.invalidateQueries({ queryKey: ['receiving-lines'] });
            queryClient.invalidateQueries({ queryKey: ['receiving-lines-with-serials'] });
            queryClient.invalidateQueries({ queryKey: ['receiving-line-serials'] });
            queryClient.invalidateQueries({ queryKey: qk.walkInSales.all });
            queryClient.invalidateQueries({ queryKey: ['dashboard-operations'] });
          }
        };
        client?.connection.on(listener);
      })
      .catch(() => {});

    return () => {
      disposed = true;
      if (client && listener) {
        try {
          client.connection.off(listener);
        } catch {
          /* ignore */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reconnect]);
}
