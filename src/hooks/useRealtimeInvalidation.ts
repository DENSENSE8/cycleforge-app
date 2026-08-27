'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
import { OUTBOUND_QUERY_PREFIXES } from '@/lib/outbound/outbound-cache-keys';
import { receivingFeedsRecentlyInvalidatedLocally } from '@/lib/queries/receiving-queries';
import {
  invalidateUnshippedCounts,
  patchUnshippedOrderTested,
} from '@/lib/queries/dashboard-cache-patch';

function invalidateOutboundQueues(queryClient: ReturnType<typeof useQueryClient>) {
  for (const queryKey of OUTBOUND_QUERY_PREFIXES) {
    queryClient.invalidateQueries({ queryKey: [...queryKey] });
  }
  queryClient.invalidateQueries({ queryKey: ['outbound-search', 'labels-count'] });
}

interface UseRealtimeInvalidationOptions {
  dashboard?: boolean;
  repair?: boolean;
  receiving?: boolean;
  walkIn?: boolean;
  /**
   * Register a connection listener that invalidates *all* dashboard caches
   * when the Ably realtime client reconnects after a disconnect (e.g. laptop
   * sleep, network blip). Events published while disconnected are lost, so a
   * broad invalidate is the safe recovery.
   *
   * Set `true` on the top-level dashboard page; channel-scoped consumers
   * (e.g. a mobile receiving list) typically don't need this — their parent
   * dashboard handles it.
   */
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
    (message: any) => {
      const source = String(message?.data?.source ?? message?.source ?? '');
      if (source === 'orders.add') {
        invalidateUnshippedCounts(queryClient);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['dashboard-table', 'pending'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-table', 'unshipped'] });
      // The new counts key (Phase 2) lives under a SEPARATE prefix, so the row
      // invalidate above doesn't cover it — refresh it explicitly.
      invalidateUnshippedCounts(queryClient);
      queryClient.invalidateQueries({ queryKey: ['dashboard-table', 'shipped'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-table', 'shipped-fba'] });
      queryClient.invalidateQueries({ queryKey: ['shipped-table'] });
      queryClient.invalidateQueries({ queryKey: ['shipped-table-fba'] });
      invalidateOutboundQueues(queryClient);
    },
    !!ordersChannel && dashboard,
    frameCoalesce,
  );

  // Assignment changes can patch one table in-place, but other dashboard
  // caches (including alternate filters/views) still need a refetch.
  useAblyChannel(
    ordersChannel,
    'order.assignments',
    () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-table', 'pending'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-table', 'unshipped'] });
      // The new counts key (Phase 2) lives under a SEPARATE prefix, so the row
      // invalidate above doesn't cover it — refresh it explicitly.
      invalidateUnshippedCounts(queryClient);
      queryClient.invalidateQueries({ queryKey: ['dashboard-table', 'shipped'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-table', 'shipped-fba'] });
      queryClient.invalidateQueries({ queryKey: ['shipped-table'] });
      queryClient.invalidateQueries({ queryKey: ['shipped-table-fba'] });
      invalidateOutboundQueues(queryClient);
    },
    !!ordersChannel && dashboard,
    frameCoalesce,
  );

  useAblyChannel(
    ordersChannel,
    'queue.assignments',
    () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-table', 'pending'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-table', 'unshipped'] });
      // The new counts key (Phase 2) lives under a SEPARATE prefix, so the row
      // invalidate above doesn't cover it — refresh it explicitly.
      invalidateUnshippedCounts(queryClient);
      queryClient.invalidateQueries({ queryKey: ['dashboard-table', 'shipped'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-table', 'shipped-fba'] });
      queryClient.invalidateQueries({ queryKey: ['shipped-table'] });
      queryClient.invalidateQueries({ queryKey: ['shipped-table-fba'] });
      invalidateOutboundQueues(queryClient);
    },
    !!ordersChannel && dashboard,
    frameCoalesce,
  );

  // Serial added from the tech station publishes order.tested (not order.changed).
  // Invalidate shipped views so the serial list in the details panel stays current.
  useAblyChannel(
    ordersChannel,
    'order.tested',
    () => {
      // Phase 3: the Unshipped rows are patched IN PLACE by the sibling
      // subscription below (has_tech_scan → the row moves pending → tested
      // lane), so do NOT broad-invalidate the row list here — a tech scan on an
      // idle dashboard causes 0 full /api/orders refetch. Just refresh the
      // cheap counts.
      invalidateUnshippedCounts(queryClient);
      queryClient.invalidateQueries({ queryKey: ['dashboard-table', 'shipped'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-table', 'shipped-fba'] });
      queryClient.invalidateQueries({ queryKey: ['shipped-table'] });
      queryClient.invalidateQueries({ queryKey: ['shipped-table-fba'] });
    },
    !!ordersChannel && dashboard,
    frameCoalesce,
  );

  // …and the in-place half, as its OWN subscription. Two reasons it is not
  // folded into the handler above:
  //
  //  1. **Coalescing.** The invalidate half is last-wins-per-frame, which is
  //     right for "refetch something". This half reads `orderId` off the
  //     payload, so a coalesced burst would patch the last scan and silently
  //     drop every other bench's.
  //  2. **Ownership.** The patch used to live only inside `UnshippedTable`.
  //     Every other reader of the unshipped cache — the compare panes
  //     (`OrdersPaneTable`) and the drill host (`OrdersDrillHost`) — queries it
  //     without mounting that table, so on those surfaces a bench scan changed
  //     nothing until an unrelated event happened to invalidate. The desk hook
  //     is mounted once per surface; the patch belongs at that altitude.
  //
  // Downstream, `GridStatusCellValue` runs the live-change pulse off the label
  // this patch produces — so this subscription is what makes a scan at the
  // bench visible as motion on someone else's board.
  useAblyChannel(
    ordersChannel,
    'order.tested',
    (message: any) => {
      patchUnshippedOrderTested(queryClient, message?.data ?? {});
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
      // The Ably echo of a LOCAL scan/receive arrives just after this client
      // already ran invalidateReceivingFeeds optimistically. Skip re-invalidating
      // the two overlapping desktop-rail roots in that window so one scan doesn't
      // refetch the rails twice (the flicker). Events from OTHER clients carry no
      // recent local stamp and still refresh fully. The remaining keys below have
      // no desktop-rail observers (mobile / serials / pending), so invalidating
      // them here either way is a harmless no-op.
      const localCovered = receivingFeedsRecentlyInvalidatedLocally();
      if (!localCovered) queryClient.invalidateQueries({ queryKey: ['receiving'] });
      queryClient.invalidateQueries({ queryKey: ['receiving-pending-unboxing'] });
      if (!localCovered) queryClient.invalidateQueries({ queryKey: ['receiving-lines-table'] });
      // 'receiving-logs' is intentionally omitted: ReceivingLogs handles it
      // surgically via its own useAblyChannel (insert→insertIntoCache,
      // delete→removeFromCache). Invalidating here races with the refetch
      // and can overwrite the cache with stale data, causing new entries
      // to flash and disappear.
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

  // Carrier tracking status changed (webhook push or sync poll). Keeps the
  // incoming list, its summary tiles, and any open details panel live with the
  // carrier's real-world state — the receiving-side equivalent of the
  // order.changed dashboard refresh above.
  useAblyChannel(
    stationChannel,
    'shipment.changed',
    () => {
      queryClient.invalidateQueries({ queryKey: ['receiving-lines-table'] });
      queryClient.invalidateQueries({ queryKey: ['receiving-lines-incoming-summary'] });
      queryClient.invalidateQueries({ queryKey: ['incoming-details'] });
    },
    !!stationChannel && receiving,
    frameCoalesce,
  );

  // Email-signal events: a rescan/reconcile upserted or auto-resolved an
  // email_missing_purchase_orders row. Refreshes Incoming summary tiles
  // instantly instead of on the poll.
  useAblyChannel(
    stationChannel,
    'email-signal.changed',
    () => {
      queryClient.invalidateQueries({ queryKey: ['receiving-lines-incoming-summary'] });
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

  // ─── Reconnect listener ────────────────────────────────────────────────
  // Events published while the realtime client is disconnected are lost, so
  // when the connection recovers we invalidate broadly. Hooks must run
  // unconditionally — the `reconnect` flag gates the effect body, not the
  // hook call itself.
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
