'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { getOrdersChannelName, safeChannelName } from '@/lib/realtime/channels';
import type { DashboardSearchSectionProps } from '@/components/dashboard/DashboardSearchSectionProps';
import { downloadDataTableCsv } from '@/components/tables/DataTable';
import { TO_SHIP_QUEUE_WINDOW } from '@/lib/orders/to-ship-queue';
import { OrderStatusTrailStage } from '@/components/orders/OrderStatusTrailOverlay';
import { useToShipChrome } from '@/components/unshipped/useToShipChrome';
import {
  ORDER_EXPORT_COLUMNS,
  buildOrderExportRow,
} from '@/lib/dashboard/order-export-csv';
import { OrdersFirstRunEmptyState } from '@/components/dashboard/OrdersFirstRunEmptyState';
import { orgHasActivity, useOnboardingStats } from '@/hooks/useOnboardingStats';
import { PackAwaitingFeedback } from '@/components/packer/PackAwaitingFeedback';
import { dispatchCloseShippedDetails, dispatchOpenShippedDetails } from '@/utils/events';
import { deskCountsQuery, unshippedOrderRowQuery, unshippedOrdersQuery, unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';
import { parseDeskPairParam, readDeskRefinements } from '@/lib/orders/desk-view-filters';
import { DESK_PAIR_PARAM } from '@/lib/outbound/desk-views';
import {
  cagedOrdersQuery,
  cagedRecordToQueueRow,
} from '@/lib/queries/caged-orders-queries';
import { Button } from '@/design-system/primitives';
import { GridDegradedBox } from '@/design-system/components/grid';
import { PHONE_CARD_FACE } from '@/design-system/tokens/phone-card';
import { RefreshCw } from '@/components/Icons';
import { useRailActionSnapshot } from '@/components/right-rail/RailSelectionActions';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { useAuth } from '@/contexts/AuthContext';
import { deriveFulfillmentState, fulfillmentLaneTotals, type FulfillmentState } from '@/lib/unshipped-state';
import { resolveOrderLifecycleStage } from '@/lib/order-lifecycle';
import { getCurrentPSTDateKey, toPSTDateKey } from '@/utils/date';
import { pinRecentlyCreatedUnshipped } from '@/lib/orders/order-record-normalize';
import {
  patchUnshippedOrderCache,
  patchUnshippedOrderPicked,
  invalidateUnshippedCounts,
  insertUnshippedOrderIntoCache,
} from '@/lib/queries/dashboard-cache-patch';
import { SHIPPING_PATH } from '@/lib/outbound/route-contract';
import { SHIPPING_ORDERS_PATH, ORDERS_DESK_CONTEXT_KEY, ORDERS_DESK_SUPPORT_CONTEXT, parseOrdersDeskContext } from '@/lib/shipping/orders-desk';
import type { ShippedOrder } from '@/types/orders';
import { useLabelsWalkShortcut } from '@/components/outbound/orders/paperwork/useLabelsWalkShortcut';
import { PaperworkWalkHost } from '@/components/outbound/orders/paperwork/PaperworkWalkHost';
import { useNavIntent } from '@/lib/nav/use-nav-intent';
import { PAPERWORK_PARAM, parsePaperworkOrderId } from '@/lib/orders/print-packet';
import { PACK_PLACED_PARAM, PACK_STATION_PARAM } from '@/lib/packing/pack-station-arm';
import { OrderCardList } from '@/components/outbound/orders/cards/OrderCardList';

/** Pre-pack fulfillment queue — Dashboard Pending / Picked tabs (and pack/shipping stations that embed the same table without a lane scope). */
interface UnshippedTableProps extends DashboardSearchSectionProps {
  packedBy?: number;
  pickerId?: number;
  /** Rail-selection model: the check-set is the single selection SoT and drives
   *  the right-rail inspector (History / order-rail SoT). */
  railSelection?: boolean;
  /**
   * Override row open. Default opens shipped details (`dispatchOpenShippedDetails`).
   * Pack station passes this to open the pack overlay instead.
   */
  onOpenRecord?: (record: ShippedOrder) => void;
  /**
   * Dashboard lifecycle lane. `pending` = PENDING + BLOCKED (exclude PICKED);
   * `picked` = PICKED only. Omit for station embeds (all lanes + `?ustatus`).
   */
  fulfillmentLane?: 'pending' | 'picked';
  /** Pin this desk to ONE derived pre-dock state, whatever the URL says. */
  lockedFulfillmentState?: FulfillmentState;
  /**
   * Soft idle copy when the board has nothing to show (and when the fetch
   * failed with zero rows). Pack uses "Awaiting scan" instead of a red
   * degraded alert or a first-run sales-channel CTA.
   */
  awaitingMessage?: string;
  /** SSR stand-in handoff — primary queue has paintable rows (seed or fetch). */
  onPrimaryPainted?: () => void;
}

/** Stable empty page. `query.data || []` minted a fresh array on every render
 *  while the query was undefined/loading, which by itself defeats any memo keyed
 *  on the row list — the identity changed even though nothing had. */
const EMPTY_UNSHIPPED_ROWS: ShippedOrder[] = [];

/** Map an assignment/order-changed event payload to the flat row patch it implies
 *  (only the fields the event carries). Applied to the cache via
 *  {@link patchUnshippedOrderCache}. */
export function assignmentPatchFromEvent(detail: any): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const {
    pickerId,
    packerId,
    pickerName,
    packerName,
    deadlineAt,
    outOfStock,
    notes,
    itemNumber,
    condition,
  } = detail || {};

  if (pickerId !== undefined) {
    patch.picker_id = pickerId;
    patch.picker_name = pickerName ?? null;
  }
  if (packerId !== undefined) {
    patch.packer_id = packerId;
    patch.packer_name = packerName ?? null;
    patch.packed_by_name = packerName ?? null;
  }
  if (deadlineAt !== undefined) patch.deadline_at = deadlineAt;
  if (outOfStock !== undefined || detail?.isOutOfStock !== undefined) {
    const flagged =
      detail?.isOutOfStock !== undefined
        ? Boolean(detail.isOutOfStock)
        : Boolean(String(outOfStock || '').trim());
    patch.is_out_of_stock = flagged;
  }
  // The urgent toggle rides the same event as assignments (useOrderAssignment dispatches isUrgent on every mutation).
  if (detail?.isUrgent !== undefined) patch.is_urgent = Boolean(detail.isUrgent);
  if (notes !== undefined) patch.notes = notes;
  if (itemNumber !== undefined) patch.item_number = itemNumber;
  if (condition !== undefined) patch.condition = condition;
  if (detail?.shippingTrackingNumber !== undefined) patch.shipping_tracking_number = detail.shippingTrackingNumber;

  return patch;
}

function orderIdOf(row: ShippedOrder): number {
  return Number(row.id);
}

export function UnshippedTable({
  packedBy,
  pickerId,
  strictSearchScope = false,
  searchEmptyTitle = 'No orders found',
  searchResultLabel = 'orders to ship',
  clearSearchLabel = 'Show All Pending Orders',
  railSelection = false,
  onOpenRecord,
  fulfillmentLane,
  lockedFulfillmentState,
  awaitingMessage,
  onPrimaryPainted,
}: UnshippedTableProps = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const orgId = user?.organizationId;
  // Fulfillment queue stages: pending (not picked) and picked (packing now).
  const stageParam = String(searchParams.get('stage') || 'all').toLowerCase();

  // Legacy `?stage=awaiting` → Outbound · Labels (awaiting moved off Unshipped).
  useEffect(() => {
    if (stageParam !== 'awaiting') return;
    router.replace(SHIPPING_PATH, { scroll: false });
  }, [stageParam, router]);

  const stageFilter: 'all' | 'pending' | 'picked' | 'packed' =
    stageParam === 'pending' ? 'pending'
      : stageParam === 'picked' ? 'picked'
        : stageParam === 'packed' ? 'packed'
          : 'all';
  // Click-to-filter from the status legend (`?ustatus`) — exact derived pre-dock
  // state. Composes on top of the coarse `?stage` facet.
  const urlStatusFilter = String(searchParams.get('ustatus') || '').trim().toUpperCase() as FulfillmentState | '';
  // A desk that declares its lane owns it — see `lockedFulfillmentState`.
  const statusFilter: FulfillmentState | '' = lockedFulfillmentState ?? urlStatusFilter;
  // Urgent-only board filter — operator-flagged expedited rows (orders.is_urgent).
  // Wire param is still `attention` (kept for deep-link / saved-pref stability);
  // its meaning is now "urgent only", not the legacy blocked ∪ late fire queue.
  const urgentOnly =
    searchParams.get('attention') === '1' || searchParams.get('attention') === 'true';
  /** Must-ship / overdue — days past ship-by ≥ 0 (due today or late). */
  const lateOnly =
    searchParams.get('late') === '1' || searchParams.get('late') === 'true';
  /** Ship-by aging bucket; unlike `late`, this is mutually complete. */
  const agingRaw = String(searchParams.get('aging') || '').toLowerCase();
  const agingBucket =
    agingRaw === 'overdue' ||
    agingRaw === 'today' ||
    agingRaw === 'upcoming' ||
    agingRaw === 'unscheduled'
      ? agingRaw
      : '';
  /** Exception row flag refine (`?rowFlag=awaiting_customer`). */
  const rowFlagFilter = String(searchParams.get('rowFlag') || '').trim().toLowerCase();
  /** CAGED facet (`?cage=1`). */
  const cagedOnly =
    searchParams.get('cage') === '1' || searchParams.get('cage') === 'true';
  /** Packing-station placement: any placed package or one bench id. */
  const packPlacedOnly =
    searchParams.get(PACK_PLACED_PARAM) === '1' ||
    searchParams.get(PACK_PLACED_PARAM) === 'true';
  const packStationParam = Number(searchParams.get(PACK_STATION_PARAM));
  const packStationId =
    Number.isFinite(packStationParam) && packStationParam > 0 ? packStationParam : null;
  // Universal staff filter (P1-WORK-02): `?staff=` narrows to one staff's
  // assigned work. Absent = ALL staff (current behavior preserved).
  const staffParam = Number(searchParams.get('staff'));
  const staffId = Number.isFinite(staffParam) && staffParam > 0 ? staffParam : undefined;
  const openOrderIdRaw = searchParams.get('openOrderId');
  const openOrderIdValue = Number(openOrderIdRaw);
  const openOrderId =
    Number.isFinite(openOrderIdValue) && openOrderIdValue > 0 ? openOrderIdValue : null;
  const paperworkId = parsePaperworkOrderId(searchParams.get(PAPERWORK_PARAM));
  /* Shortage desk lens (`?pair=po`), filtered SERVER-side (`@/lib/orders/desk-view-filters`): */
  const pairFilter =
    lockedFulfillmentState === 'BLOCKED' ? parseDeskPairParam(searchParams.get(DESK_PAIR_PARAM)) ?? undefined : undefined;
  /* Sidebar refinements (`?pickedBy` / `?packedBy` / `?pickerId` / `?orderFrom|To` /
   * `?shipByFrom|To`), filtered SERVER-side with the same parse the nav facets use.
   * An explicit `packedBy` / `pickerId` prop wins over the URL. */
  const refine = readDeskRefinements(searchParams);
  const packedByFilter = packedBy ?? refine.packedBy ?? undefined;
  const pickerIdFilter = pickerId ?? refine.pickerId ?? undefined;
  const pickedByFilter = refine.pickedBy ?? undefined;
  const orderFrom = refine.orderFrom ?? undefined;
  const orderTo = refine.orderTo ?? undefined;
  const shipByFrom = refine.shipByFrom ?? undefined;
  const shipByTo = refine.shipByTo ?? undefined;
  const [walkIds, setWalkIds] = useState<number[] | null>(null);
  const { rows: selectedRailRows } = useRailActionSnapshot();
  const isSupportContext =
    parseOrdersDeskContext(searchParams.get(ORDERS_DESK_CONTEXT_KEY)) ===
    ORDERS_DESK_SUPPORT_CONTEXT;
  const fetchWindow = TO_SHIP_QUEUE_WINDOW;
  const [rowLimit, setRowLimit] = useState(fetchWindow);
  useEffect(() => {
    setRowLimit(fetchWindow);
  }, [
    stageFilter,
    statusFilter,
    urgentOnly,
    lateOnly,
    agingBucket,
    rowFlagFilter,
    packPlacedOnly,
    packStationId,
    cagedOnly,
    pairFilter,
    packedByFilter,
    pickerIdFilter,
    pickedByFilter,
    orderFrom,
    orderTo,
    shipByFrom,
    shipByTo,
  ]);


  /** The desk's chrome — lifted HERE, above the sheet that draws it, because the find field is now part of the QUERY. */
  const chrome = useToShipChrome({ blockedQueue: lockedFulfillmentState === 'BLOCKED' });
  const searchQuery = chrome.search.value;

  const query = useQuery({
    ...unshippedOrdersQuery({
      // The find text IS part of the fetch now.
      searchQuery,
      packedBy: packedByFilter,
      pickerId: pickerIdFilter,
      pickedBy: pickedByFilter,
      orderFrom,
      orderTo,
      shipByFrom,
      shipByTo,
      staffId,
      strictSearchScope,
      // Coarse stage facet now filtered SERVER-side (Phase 1). Absent = all.
      stage: stageFilter === 'all' ? undefined : stageFilter,
      // Bounded page (Phase 2) — the unsearched queue only. The fetch ignores
      // it while a query is present, and so does the "load more" control below.
      limit: rowLimit,
      // A desk locked to BLOCKED asks the server for the blocked scope — the
      // To-ship scope would never hand it a label-less blocked row to filter.
      blockedOnly: lockedFulfillmentState === 'BLOCKED',
      pair: pairFilter,
    }),
    // Keep rows visible while search/stage refetch, but never bleed the previous
    // staff scope or desk lens into a new one — that made ?staff= look like it
    // wasn't filtering.
    placeholderData: (previousData, previousQuery) => {
      const prev = previousQuery?.queryKey?.[2] as
        | { staffId?: number; pair?: string; pickedBy?: number; packedBy?: number; pickerId?: number }
        | undefined;
      if (
        prev?.staffId !== staffId ||
        prev?.pair !== pairFilter ||
        prev?.pickedBy !== pickedByFilter ||
        prev?.packedBy !== packedByFilter ||
        prev?.pickerId !== pickerIdFilter
      ) {
        return undefined;
      }
      return previousData;
    },
    // The live queue is not what the Caged facet shows, so do not pay for it.
    // The key stays cached, so switching back repaints from cache.
    enabled: !cagedOnly,
  });
  // A URL dossier can name a row outside the bounded first page. Fetch that
  // single queue member and merge it into the same row collection so the
  // engine's existing `scrollToKey` contract can select its page.
  const deepLinkQuery = useQuery({
    ...unshippedOrderRowQuery({ orderId: openOrderId, staffId }),
    enabled: !cagedOnly && openOrderId != null,
  });


  const cagedQuery = useQuery({ ...cagedOrdersQuery(), enabled: cagedOnly });
  const cagedRows = useMemo(
    () => (cagedQuery.data?.orders ?? []).map(cagedRecordToQueueRow),
    [cagedQuery.data],
  );

  /* The fourth settled state (loading → absence → no-match → **degraded**). */
  const queueError = cagedOnly ? cagedQuery.isError : query.isError;
  const { refetch: refetchQueue } = query;
  const { refetch: refetchCaged } = cagedQuery;
  const retryQueue = useCallback(() => {
    void (cagedOnly ? refetchCaged() : refetchQueue());
  }, [cagedOnly, refetchCaged, refetchQueue]);

  useEffect(() => {
    if (!onPrimaryPainted) return;
    // Paintable = settled with any result (including empty queue) or seeded data.
    if (query.isSuccess || (query.data != null && !query.isLoading)) {
      onPrimaryPainted();
    }
  }, [onPrimaryPainted, query.isSuccess, query.data, query.isLoading]);

  useEffect(() => {
    const onAdded = (event: Event) => {
      const row = (event as CustomEvent).detail;
      if (row && typeof row === 'object') insertUnshippedOrderIntoCache(queryClient, row);
    };
    window.addEventListener('unshipped-order-added', onAdded);
    return () => window.removeEventListener('unshipped-order-added', onAdded);
  }, [queryClient]);

  // Stage-aware total from the counts endpoint (dedup-independent) drives the
  // "Load more" affordance without downloading extra rows. Dedupes with the sidebar.
  const { data: queueCounts } = useQuery({
    ...unshippedQueueCountsQuery({ staffId }),
  });
  // The `pair=po` lens narrows the rows server-side, so its denominator is the
  // desk-counts `po` badge (same SQL), not the unfiltered queue total.
  const { data: deskCounts } = useQuery({ ...deskCountsQuery(), enabled: pairFilter != null });

  const ordersChannelName = safeChannelName(() => getOrdersChannelName(orgId!));

  useAblyChannel(
    ordersChannelName,
    'order.assignments',
    (message: any) => {
      const d = message?.data;
      const orderId = Number(d?.orderId);
      if (!Number.isFinite(orderId)) return;

      const detail = {
        orderIds: [orderId],
        pickerId: d.pickerId,
        packerId: d.packerId,
        pickerName: d.pickerName,
        packerName: d.packerName,
        deadlineAt: d.deadlineAt,
        shippingTrackingNumber: d.shippingTrackingNumber,
      };

      const hasAnyChange =
        detail.pickerId !== undefined ||
        detail.packerId !== undefined ||
        detail.deadlineAt !== undefined ||
        detail.shippingTrackingNumber !== undefined;
      if (!hasAnyChange) return;

      patchUnshippedOrderCache(queryClient, orderId, assignmentPatchFromEvent(detail));
      // out_of_stock/deadline can change the derived lane → keep the legend fresh.
      invalidateUnshippedCounts(queryClient);
    },
    !!ordersChannelName,
  );

  // Pending-stage rows live in this merged queue too, so reflect the picker desk's scan (has_pick_scan, picked_*) in place — the /tech embed has no desk hook to do it.
  useAblyChannel(
    ordersChannelName,
    'order.picked',
    (message: { data?: Parameters<typeof patchUnshippedOrderPicked>[1] } | null) => {
      patchUnshippedOrderPicked(queryClient, message?.data ?? { orderId: undefined });
    },
    !!ordersChannelName,
  );

  useEffect(() => {
    const handleAssignmentUpdated = (e: Event) => {
      const detail = (e instanceof CustomEvent ? e.detail : null) || {};
      const orderIds = Array.isArray(detail.orderIds) ? detail.orderIds : [];
      if (orderIds.length === 0) return;

      const hasAnyChange =
        detail.pickerId !== undefined ||
        detail.packerId !== undefined ||
        detail.deadlineAt !== undefined ||
        detail.outOfStock !== undefined ||
        detail.isUrgent !== undefined ||
        detail.isOutOfStock !== undefined ||
        detail.notes !== undefined ||
        detail.itemNumber !== undefined ||
        detail.condition !== undefined ||
        detail.shippingTrackingNumber !== undefined;
      if (!hasAnyChange) return;

      const idSet = new Set<number>(orderIds.map(Number));
      const patch = assignmentPatchFromEvent(detail);
      for (const oid of idSet) patchUnshippedOrderCache(queryClient, oid, patch);
      invalidateUnshippedCounts(queryClient);
    };

    window.addEventListener('order-assignment-updated', handleAssignmentUpdated);

    return () => {
      window.removeEventListener('order-assignment-updated', handleAssignmentUpdated);
    };
  }, [queryClient]);



  const handleOpenRecord = useCallback(
    (record: ShippedOrder) => {
      if (onOpenRecord) {
        onOpenRecord(record);
        return;
      }
      // A caged row has no shipped detail to show — the panel would paint an
      // order with no tracking, no bench and no lifecycle. Its detail IS the
      // triage form, so opening the row opens the gates it is waiting on.
      if (cagedOnly) {
        const next = new URLSearchParams(searchParams.toString());
        next.set('triage', String(record.id));
        const qs = next.toString();
        router.replace(qs ? `${SHIPPING_ORDERS_PATH}?${qs}` : SHIPPING_ORDERS_PATH, {
          scroll: false,
        });
        return;
      }
      dispatchOpenShippedDetails(record, 'queue', { force: true });
    },
    [cagedOnly, onOpenRecord, router, searchParams],
  );

  const allRecords = useMemo(() => {
    if (cagedOnly) return cagedRows;
    const loaded = query.data ?? EMPTY_UNSHIPPED_ROWS;
    const deepLinked = deepLinkQuery.data;
    if (!deepLinked || loaded.some((record) => Number(record.id) === Number(deepLinked.id))) {
      return loaded;
    }
    return [...loaded, deepLinked];
  }, [cagedOnly, cagedRows, deepLinkQuery.data, query.data]);
  // `?stage` is filtered SERVER-side; dashboard tabs no longer force a lane — stage is a row fact.
  const todayKey = getCurrentPSTDateKey();
  const laneRecords = useMemo(
    () =>
      // The caged set is already the answer — the server returned exactly the held rows.
      cagedOnly
        ? allRecords
        : allRecords.filter((r) => {
        const row = r as {
          has_pick_scan?: boolean;
          is_out_of_stock?: boolean;
          is_urgent?: boolean;
          tracking_number?: string | null;
          shipping_tracking_number?: string | null;
          pack_location_id?: number | null;
          packed_at?: string | null;
          pack_activity_at?: string | null;
          shipment_id?: number | string | null;
          deadline_at?: string | null;
          ship_by_date?: string | null;
          row_flag?: string | null;
        };
        /* NO tracking gate (2026-08-30). */
        const packedAt = row.packed_at || row.pack_activity_at || null;
        const lifecycle = resolveOrderLifecycleStage({
          shipmentId: row.shipment_id,
          hasPickScan: Boolean(row.has_pick_scan),
          isOutOfStock: Boolean(row.is_out_of_stock),
          packedAt,
        });
        const state = deriveFulfillmentState({
          hasPickScan: Boolean(row.has_pick_scan),
          isOutOfStock: Boolean(row.is_out_of_stock),
        });

        if (fulfillmentLane === 'picked') {
          if (lifecycle === 'PACKED_STAGED') return false;
          if (state !== 'PICKED') return false;
        } else if (fulfillmentLane === 'pending') {
          if (lifecycle === 'PACKED_STAGED') return false;
          if (state === 'PICKED') return false;
          if (statusFilter === 'BLOCKED' && state !== 'BLOCKED') return false;
          if (statusFilter && statusFilter !== 'BLOCKED' && state !== statusFilter) return false;
        } else if (statusFilter) {
          if (statusFilter === 'BLOCKED') {
            if (state !== 'BLOCKED') return false;
          } else if (lifecycle === 'PACKED_STAGED') {
            return false;
          } else if (state !== statusFilter) {
            return false;
          }
        } else if (stageFilter === 'pending') {
          if (lifecycle === 'PACKED_STAGED') return false;
          if (state === 'PICKED') return false;
        } else if (stageFilter === 'picked') {
          if (state !== 'PICKED') return false;
        } else if (stageFilter === 'packed') {
          if (lifecycle !== 'PACKED_STAGED') return false;
        }

        if (urgentOnly && !row.is_urgent) return false;

        if (lateOnly) {
          const deadlineKey = toPSTDateKey(row.deadline_at || row.ship_by_date || null);
          // Must ship = ship-by is today or past (PST civil). No deadline → not must-ship.
          if (!deadlineKey || !todayKey || deadlineKey > todayKey) return false;
        }

        if (agingBucket) {
          const deadlineKey = toPSTDateKey(row.deadline_at || row.ship_by_date || null);
          const matchesAging =
            agingBucket === 'unscheduled'
              ? !deadlineKey
              : agingBucket === 'overdue'
                ? Boolean(deadlineKey && todayKey && deadlineKey < todayKey)
                : agingBucket === 'today'
                  ? Boolean(deadlineKey && todayKey && deadlineKey === todayKey)
                  : Boolean(deadlineKey && todayKey && deadlineKey > todayKey);
          if (!matchesAging) return false;
        }

        if (rowFlagFilter) {
          if (String(row.row_flag || '').trim().toLowerCase() !== rowFlagFilter) return false;
        }

        const placedId = row.pack_location_id != null ? Number(row.pack_location_id) : null;
        if (packStationId != null) {
          if (placedId !== packStationId) return false;
        } else if (packPlacedOnly && !(placedId != null && placedId > 0)) {
          return false;
        }
        return true;
      }),
    [
      allRecords,
      fulfillmentLane,
      statusFilter,
      stageFilter,
      urgentOnly,
      lateOnly,
      agingBucket,
      rowFlagFilter,
      packStationId,
      packPlacedOnly,
      todayKey,
      cagedOnly,
    ],
  );
  const records = useMemo(
    () => pinRecentlyCreatedUnshipped(laneRecords),
    [laneRecords],
  );

  useEffect(() => {
    if (paperworkId == null) setWalkIds(null);
  }, [paperworkId]);

  const patchPaperwork = useCallback(
    (id: number | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id == null) {
        params.delete(PAPERWORK_PARAM);
      } else {
        params.set(PAPERWORK_PARAM, String(id));
        // One writer. Closing the inspector via `dispatchCloseShippedDetails`
        // issues a second `router.replace` from a stale searchParams snapshot
        // and wipes `?paperwork=` — the desk then flashes table ↔ walk.
        params.delete('openOrderId');
      }
      const qs = params.toString();
      router.replace(
        qs ? `${SHIPPING_ORDERS_PATH}?${qs}` : SHIPPING_ORDERS_PATH,
        { scroll: false },
      );
    },
    [router, searchParams],
  );

  const walkRows = useMemo(() => {
    if (!walkIds) return records;
    return walkIds
      .map((id) => records.find((r) => Number(r.id) === id))
      .filter((r): r is ShippedOrder => r != null);
  }, [records, walkIds]);

  const closePaperworkWalk = useCallback(() => {
    setWalkIds(null);
    patchPaperwork(null);
  }, [patchPaperwork]);

  const openLabelsWalk = useCallback(() => {
    if (cagedOnly || paperworkId != null) return;
    const selected = selectedRailRows
      .map((row) => Number((row as { id?: unknown }).id))
      .filter((id) => Number.isFinite(id) && id > 0);
    const selectedPool =
      selected.length > 0
        ? records.filter((r) => selected.includes(Number(r.id)))
        : [];
    const pool = selectedPool.length > 0 ? selectedPool : records;
    const first = pool[0];
    if (!first) return;
    setWalkIds(
      [...new Set(pool.map((r) => Number(r.id)))].filter((id) => Number.isFinite(id) && id > 0),
    );
    // Stay in the page header: Labels sits left of Sync there, and fullscreen
    // unrenders that row (DeskPageChrome). Inspector hides via `?paperwork=`.
    patchPaperwork(Number(first.id));
  }, [cagedOnly, paperworkId, patchPaperwork, records, selectedRailRows]);

  /** Tracking-hover **Label** door (`useOrdersSpreadsheet.onOpenLabels`) — the third entrance the walk documents, beside the header CTA and… */
  const openLabelsWalkForRecord = useCallback(
    (record: ShippedOrder) => {
      if (cagedOnly) return;
      const id = Number(record?.id);
      if (!Number.isFinite(id) || id <= 0) return;
      setWalkIds(
        [...new Set(records.map((r) => Number(r.id)))].filter(
          (rowId) => Number.isFinite(rowId) && rowId > 0,
        ),
      );
      patchPaperwork(id);
    },
    [cagedOnly, patchPaperwork, records],
  );

  const advancePaperworkWalk = useCallback(() => {
    const list = walkRows.length > 0 ? walkRows : records;
    const current = Number(paperworkId);
    const idx = list.findIndex((r) => orderIdOf(r) === current);
    const next = idx >= 0 ? list[idx + 1] : list[0];
    if (!next || orderIdOf(next) === current) {
      closePaperworkWalk();
      return;
    }
    patchPaperwork(orderIdOf(next));
  }, [closePaperworkWalk, paperworkId, patchPaperwork, records, walkRows]);

  const handlePaperworkFactsChanged = useCallback(() => {
    invalidateUnshippedCounts(queryClient);
  }, [queryClient]);

  // Copy acts on the SELECTION, and the shape it copies is the shipped order-export shape rather than the on-screen column set:
  const copyExport = useMemo(
    () => ({
      columns: [...ORDER_EXPORT_COLUMNS],
      toRow: (row: ShippedOrder) => buildOrderExportRow(row),
    }),
    [],
  );

  // First-run teaching state:
  const isIdleEmpty =
    !query.isLoading &&
    allRecords.length === 0 &&
    !statusFilter &&
    !urgentOnly &&
    stageFilter === 'all' &&
    staffId === undefined;

  // An empty QUEUE is not an empty ORG (operator 2026-09-14).
  // An empty QUEUE is not an empty ORG (operator 2026-09-14). This used to be
  const onboarding = useOnboardingStats();
  const hasActivity = orgHasActivity(onboarding.data);

  const isFirstRunEmpty =
    // An empty cage is not a brand-new org — showing "connect a sales channel"
    // there would answer a question nobody asked.
    !cagedOnly &&
    // Neither is an unreachable server.
    !queueError &&
    isIdleEmpty &&
    // UNKNOWN is not new.
    hasActivity === false;

  // Labels / export verbs MUST sit above the empty/awaiting/degraded early returns.
  const onToShipDesk =
    pathname === SHIPPING_ORDERS_PATH && !isSupportContext && !cagedOnly;
  const toggleLabelsWalk = useCallback(() => {
    if (paperworkId != null) {
      closePaperworkWalk();
      return;
    }
    openLabelsWalk();
  }, [closePaperworkWalk, openLabelsWalk, paperworkId]);
  const copyExportRef = useRef(copyExport);
  copyExportRef.current = copyExport;
  const recordsRef = useRef(records);
  recordsRef.current = records;
  const runExport = useCallback(() => {
    downloadDataTableCsv(copyExportRef.current, recordsRef.current, 'to-ship.csv');
  }, []);

  // The sidebar's To-ship verbs (`orders:labels-walk`, `desk-export:csv`);
  // withheld (painted disabled) when there is nothing to walk or export.
  const walkOpen = paperworkId != null;
  const nothingToWalk = records.length === 0;
  useNavIntent('desk-export:csv', onToShipDesk && !nothingToWalk ? runExport : null);
  useNavIntent(
    'orders:labels-walk',
    onToShipDesk && (walkOpen || !nothingToWalk) ? toggleLabelsWalk : null,
  );
  useLabelsWalkShortcut({
    enabled: onToShipDesk,
    walkOpen,
    disabled: nothingToWalk,
    onToggle: toggleLabelsWalk,
  });

  if (awaitingMessage && (isIdleEmpty || (query.isError && allRecords.length === 0))) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface-card p-6">
        <PackAwaitingFeedback message={awaitingMessage} />
      </div>
    );
  }

  // Degraded outranks every absence state: with nothing to show and a failed
  // read, the only honest screen is the one that says so and offers the retry.
  if (queueError && records.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface-card p-6">
        <GridDegradedBox
          message="Couldn't load the queue. This is not an empty queue — the orders could not be read."
          onRetry={retryQueue}
        />
      </div>
    );
  }

  if (isFirstRunEmpty) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface-card p-6">
        <OrdersFirstRunEmptyState />
      </div>
    );
  }

  // Phase 2 "Load more":
  const laneTotals = fulfillmentLaneTotals(queueCounts);
  const stageTotal =
    pairFilter === 'po' ? (deskCounts?.po ?? 0)
    : lockedFulfillmentState === 'BLOCKED'
      ? laneTotals.blocked
      : fulfillmentLane === 'pending'
      ? laneTotals.pending
      : fulfillmentLane === 'picked'
        ? laneTotals.picked
        : stageFilter === 'pending'
          ? (queueCounts?.byStage.pending ?? 0)
          : stageFilter === 'picked'
            ? (queueCounts?.byStage.picked ?? 0)
            : stageFilter === 'packed'
              ? (queueCounts?.byStage as { packed?: number } | undefined)?.packed ??
                records.length
              : (queueCounts?.total ?? 0);
  // The caged endpoint returns the whole held set (bounded at 500) in one read, so there is no second page to offer.
  const showLoadMore = !cagedOnly && !searchQuery.trim() && stageTotal > rowLimit;
  const onLoadMore = showLoadMore ? () => setRowLimit((n) => n + fetchWindow) : undefined;

  return (
    <>
      {/* Q5 stage. Walk + STATUS trail are SIBLINGS of the sheet inside {@link OrderStatusTrailStage}'s `relative` box, never a body swap. */}
      <OrderStatusTrailStage>
        <OrderCardList
          viewKey={lockedFulfillmentState === 'BLOCKED' ? 'shipping.pending' : 'shipping.to-ship'}
          chrome={chrome}
          searchPending={!cagedOnly && query.isFetching}
          records={records}
          // The desk's rows before its status cut: Report out of stock moves an order to Blocked, its record stays open.
          retainedRecords={cagedOnly ? undefined : allRecords}
          loading={cagedOnly ? cagedQuery.isLoading : query.isLoading}
          onOpenRecord={handleOpenRecord}
          onCloseRecord={dispatchCloseShippedDetails}
          railSelection={railSelection}
          onLoadMore={onLoadMore}
          queueTotal={cagedOnly ? undefined : stageTotal}
          fetching={!cagedOnly && query.isFetching}
          banner={queueError ? <QueueStaleBand onRetry={retryQueue} /> : null}
          searchEmptyTitle={searchEmptyTitle}
          searchResultLabel={searchResultLabel}
          clearSearchLabel={clearSearchLabel}
          onOpenLabels={onToShipDesk ? openLabelsWalkForRecord : undefined}
        />
        {paperworkId != null && onToShipDesk ? (
          <PaperworkWalkHost
            rows={walkRows.length > 0 ? walkRows : records}
            selectedId={paperworkId}
            loading={query.isLoading}
            onSelect={patchPaperwork}
            onAdvance={advancePaperworkWalk}
            onExit={closePaperworkWalk}
            onFactsChanged={handlePaperworkFactsChanged}
          />
        ) : null}
      </OrderStatusTrailStage>
    </>
  );
}

/** Refresh failed while rows are already on screen — the non-blocking half of the degraded state. */
function QueueStaleBand({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="status"
      data-testid="to-ship-stale-band"
      className={`${PHONE_CARD_FACE} my-2 flex shrink-0 flex-wrap items-center justify-center gap-x-2 gap-y-1 border border-border-danger bg-surface-danger px-3 py-1.5 text-role-caption text-text-danger`}
    >
      <RefreshCw aria-hidden className="h-3.5 w-3.5 shrink-0" />
      <span>Couldn&apos;t refresh — showing the last rows that loaded.</span>
      <Button type="button" size="sm" variant="ghost" onClick={onRetry} className="text-text-danger">
        Retry
      </Button>
    </div>
  );
}

