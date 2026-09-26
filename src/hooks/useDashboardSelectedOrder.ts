'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ShippedOrder } from '@/types/orders';
import { fetchDashboardOrderRowById } from '@/lib/dashboard-table-data';
import {
  patchDashboardSelectedOrderFromAssignment,
  resolveDashboardSelectedOrderCandidate,
  normalizeDashboardDetailsContext,
  parseDashboardOpenOrderId,
  type DashboardSelectionSnapshot,
} from '@/utils/dashboard-search-state';
import {
  dispatchCloseShippedDetails,
  dispatchOpenShippedDetails,
  getOpenShippedDetailsPayload,
  type ShippedDetailsContext,
} from '@/utils/events';
import { readDetailsOpenBehaviorPreference } from '@/utils/dashboard-preferences';

// Bumped to v2 to invalidate stale snapshots that stored a corrupted packed_at
// (filled from orders.created_at by an older round-trip path). v1 entries are
// silently ignored on read; new writes use v2.
const SELECTED_ORDER_SNAPSHOT_KEY = 'dashboard:selected-order:v2';

function readStoredSelection(orderId: number): DashboardSelectionSnapshot | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.sessionStorage.getItem(SELECTED_ORDER_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DashboardSelectionSnapshot;
    if (Number(parsed?.order?.id) !== orderId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredSelection(order: ShippedOrder, context: ShippedDetailsContext) {
  if (typeof window === 'undefined') return;

  try {
    const snapshot: DashboardSelectionSnapshot = {
      order,
      context,
      savedAt: Date.now(),
    };
    window.sessionStorage.setItem(SELECTED_ORDER_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Best effort only.
  }
}

function clearStoredSelection() {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.removeItem(SELECTED_ORDER_SNAPSHOT_KEY);
  } catch {
    // Best effort only.
  }
}

export function useDashboardSelectedOrder(detailsEnabled: boolean) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [selectedShipped, setSelectedShipped] = useState<ShippedOrder | null>(null);
  const [selectedContext, setSelectedContext] = useState<ShippedDetailsContext>('queue');
  // Tracks the ID we've already applied locally but whose URL update may still be in flight.
  // Prevents the openOrderId-sync effect from reverting to the stale URL value.
  const pendingOrderIdRef = useRef<number | null>(null);
  // Tracks an openOrderId that the user just closed.
  const ignoredOpenOrderIdRef = useRef<{ id: number; seen: boolean } | null>(null);

  const openOrderId = useMemo(() => {
    return parseDashboardOpenOrderId(searchParams.get('openOrderId'));
  }, [searchParams]);

  const replaceOpenOrderId = useCallback((orderId: number | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (orderId && Number.isFinite(orderId) && orderId > 0) {
      params.set('openOrderId', String(orderId));
    } else {
      params.delete('openOrderId');
    }
    const nextSearch = params.toString();
    const nextPath = pathname || '/shipping/orders';
    router.replace(nextSearch ? `${nextPath}?${nextSearch}` : nextPath);
  }, [pathname, router, searchParams]);

  const applySelectedOrder = useCallback((order: ShippedOrder, context?: ShippedDetailsContext) => {
    const nextContext = normalizeDashboardDetailsContext(order, context);
    const orderId = Number(order.id);
    setSelectedShipped(order);
    ignoredOpenOrderIdRef.current = null;
    setSelectedContext(nextContext);
    writeStoredSelection(order, nextContext);

    if (orderId !== openOrderId) {
      pendingOrderIdRef.current = orderId;
      replaceOpenOrderId(orderId);
    }
  }, [openOrderId, replaceOpenOrderId]);

  const clearSelectedOrder = useCallback((syncUrl = true) => {
    // The id being closed: the URL's, or — when the open's URL write is still
    // in flight — the one that write will land.
    const closingId = openOrderId ?? pendingOrderIdRef.current;
    setSelectedShipped(null);
    pendingOrderIdRef.current = null;
    clearStoredSelection();
    if (syncUrl && closingId != null) {
      ignoredOpenOrderIdRef.current = { id: closingId, seen: openOrderId === closingId };
      replaceOpenOrderId(null);
    }
  }, [openOrderId, replaceOpenOrderId]);

  // Latest-ref so the disable effect below depends only on `detailsEnabled`.
  const clearSelectedOrderRef = useRef(clearSelectedOrder);
  clearSelectedOrderRef.current = clearSelectedOrder;

  useEffect(() => {
    // Disabled (Search / Receiving / FBA): this hook must not touch the URL or
    // react to panel events at all — `openOrderId` belongs to Dashboard Search
    // (`useDashboardSearchOrder`) there.
    if (!detailsEnabled) return;
    const handleOpen = (e: CustomEvent<ShippedOrder>) => {
      const payload = getOpenShippedDetailsPayload(e.detail);
      if (!payload?.order) return;
      const behavior = readDetailsOpenBehaviorPreference();
      // In side-panel mode, suppress automatic queue expansion. An explicit
      // operator open (row tap / keyboard activation) still owns the intent.
      if (!payload.force && behavior === 'side_panel' && payload.context === 'queue') return;
      applySelectedOrder(payload.order, payload.context);
    };
    // Sync URL so openOrderId does not immediately re-resolve and re-open the panel
    // (e.g. hamburger in DashboardSidebar only dispatches close-shipped-details).
    const handleClose = () => clearSelectedOrder(true);
    const handleAssignmentUpdate = (e: any) => {
      const detail = e?.detail || {};
      const hasMatchingIds = Array.isArray(detail.orderIds) && detail.orderIds.some((id: any) => Number.isFinite(Number(id)));
      if (!hasMatchingIds) return;

      setSelectedShipped((current) => {
        const next = patchDashboardSelectedOrderFromAssignment(current, detail);
        if (!next || next === current) return current;
        writeStoredSelection(next, selectedContext);
        return next;
      });
    };

    window.addEventListener('open-shipped-details' as any, handleOpen as any);
    window.addEventListener('close-shipped-details' as any, handleClose as any);
    window.addEventListener('order-assignment-updated' as any, handleAssignmentUpdate as any);

    return () => {
      window.removeEventListener('open-shipped-details' as any, handleOpen as any);
      window.removeEventListener('close-shipped-details' as any, handleClose as any);
      window.removeEventListener('order-assignment-updated' as any, handleAssignmentUpdate as any);
    };
  }, [detailsEnabled, applySelectedOrder, clearSelectedOrder, selectedContext]);

  useEffect(() => {
    if (detailsEnabled) return;
    dispatchCloseShippedDetails();
    // Do not strip `openOrderId` from the URL — Dashboard Search mode owns that
    // param for `SearchOrderDetailShell`. Syncing URL here raced canonicalize
    // and bounced operators back to a q-only list until they clicked the sidebar.
    clearSelectedOrderRef.current(false);
  }, [detailsEnabled]);

  useEffect(() => {
    if (!detailsEnabled) return;
    if (openOrderId == null) {
      // URL has caught up to a cleared state; the close-in-flight guard is no
      // longer needed — unless the closed id has not reached the URL yet.
      if (ignoredOpenOrderIdRef.current?.seen) ignoredOpenOrderIdRef.current = null;
      // CRITICAL: bail if a router.replace from applySelectedOrder hasn't landed yet.
      if (pendingOrderIdRef.current != null) return;
      if (selectedShipped) {
        clearSelectedOrder(false);
      }
      return;
    }

    // If this URL value is one the user just closed and the router.replace(null)
    // hasn't landed yet, ignore it — otherwise we'd re-resolve and reopen the
    // panel mid-exit.
    const ignored = ignoredOpenOrderIdRef.current;
    if (ignored?.id === openOrderId) {
      ignored.seen = true;
      return;
    }
    ignoredOpenOrderIdRef.current = null;

    // Clear the pending flag once the URL catches up to the value we set.
    if (pendingOrderIdRef.current === openOrderId) {
      pendingOrderIdRef.current = null;
    }

    // If a navigation is in-flight (selectedShipped already updated, URL hasn't
    // caught up yet), skip resolution — it would revert to the stale URL value.
    if (pendingOrderIdRef.current != null) return;

    if (Number(selectedShipped?.id) === openOrderId) return;

    let cancelled = false;

    const resolveSelectedOrder = async () => {
      const cachedQueryEntries = [
        ...queryClient.getQueriesData({ queryKey: ['dashboard-table'] }),
        ...queryClient.getQueriesData({ queryKey: ['dashboard-unified-search'] }),
      ];
      const stored = readStoredSelection(openOrderId);
      const localResolved = resolveDashboardSelectedOrderCandidate({
        openOrderId,
        cachedEntries: cachedQueryEntries,
        storedSelection: stored,
      });

      if (localResolved?.order) {
        if (!cancelled) {
          setSelectedShipped(localResolved.order);
          setSelectedContext(localResolved.context);
          writeStoredSelection(localResolved.order, localResolved.context);
          dispatchOpenShippedDetails(localResolved.order, localResolved.context);
        }
        return;
      }

      const fetched = await fetchDashboardOrderRowById(openOrderId);
      if (!fetched || cancelled) return;

      const context = normalizeDashboardDetailsContext(fetched);
      setSelectedShipped(fetched);
      setSelectedContext(context);
      writeStoredSelection(fetched, context);
      dispatchOpenShippedDetails(fetched, context);
    };

    void resolveSelectedOrder();

    return () => {
      cancelled = true;
    };
  }, [detailsEnabled, openOrderId, queryClient, selectedShipped]);

  const requestCloseSelectedOrder = useCallback(() => {
    dispatchCloseShippedDetails();
  }, []);

  return {
    selectedShipped,
    selectedContext,
    requestCloseSelectedOrder,
  };
}
