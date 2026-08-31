'use client';

import { useCallback, useEffect, useMemo, useState, useDeferredValue } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { getOrdersChannelName, safeChannelName } from '@/lib/realtime/channels';
import type { DashboardSearchSectionProps } from '@/components/dashboard/DashboardSearchSectionProps';
import { DataTable, type DataTableExport } from '@/components/tables/DataTable';
import { useOrdersSpreadsheet } from '@/components/dashboard/orders-queue/useOrdersSpreadsheet';
import { useToShipChrome } from '@/components/unshipped/useToShipChrome';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import {
  ORDER_EXPORT_COLUMNS,
  buildOrderExportRow,
} from '@/lib/dashboard/order-export-csv';
import { useRecordCursorKeyboard } from '@/hooks/useRecordCursorKeyboard';
import { OrdersFirstRunEmptyState } from '@/components/dashboard/OrdersFirstRunEmptyState';
import { dispatchCloseShippedDetails, dispatchOpenShippedDetails } from '@/utils/events';
import { unshippedOrdersQuery, unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';
import {
  cagedOrdersQuery,
  cagedRecordToQueueRow,
} from '@/lib/queries/caged-orders-queries';
import { Button } from '@/design-system/primitives';
import { GridDegradedBox } from '@/design-system/components/grid';
import { RefreshCw } from '@/components/Icons';
import { useRailActionCount } from '@/components/right-rail/RailSelectionActions';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { useAuth } from '@/contexts/AuthContext';
import { deriveFulfillmentState, fulfillmentLaneTotals, type FulfillmentState } from '@/lib/unshipped-state';
import { resolveOrderLifecycleStage } from '@/lib/order-lifecycle';
import { getCurrentPSTDateKey, toPSTDateKey } from '@/utils/date';
import { pinRecentlyCreatedUnshipped } from '@/lib/orders/order-record-normalize';
import {
  patchUnshippedOrderCache,
  patchUnshippedOrderTested,
  invalidateUnshippedCounts,
  insertUnshippedOrderIntoCache,
} from '@/lib/queries/dashboard-cache-patch';
import { SHIPPING_PATH } from '@/components/outbound/outbound-sidebar-shared';
import { SHIPPING_ORDERS_PATH } from '@/lib/shipping/orders-desk';
import type { ShippedOrder } from '@/types/orders';
import type {
  OrdersQueueColumn,
  OrdersQueueColumnKey,
} from '@/lib/dashboard-order-row-layout';
import { useRefreshSignal } from '@/lib/refresh/bus';
import { PACK_PLACED_PARAM, PACK_STATION_PARAM } from '@/lib/packing/pack-station-arm';

/**
 * Pre-pack fulfillment queue — Dashboard Pending / Tested tabs (and pack/shipping
 * stations that embed the same table without a lane scope).
 *
 * Workbench contract: URL-addressable selection (`?openOrderId`) + crossfading
 * right-pane detail. Dashboard tabs force the lane via {@link fulfillmentLane};
 * stations omit it and keep optional `?ustatus` / `?stage` filters.
 */
export interface UnshippedTableProps extends DashboardSearchSectionProps {
  packedBy?: number;
  testedBy?: number;
  /** Pencil multi-select: rows render checkboxes; chrome owns the Select toggle. */
  selectMode?: boolean;
  /** Rail-selection model: the check-set is the single selection SoT and drives
   *  the right-rail inspector (History / order-rail SoT). */
  railSelection?: boolean;
  /**
   * Override row open. Default opens shipped details (`dispatchOpenShippedDetails`).
   * Pack station passes this to open the pack overlay instead.
   */
  onOpenRecord?: (record: ShippedOrder) => void;
  /**
   * Dashboard lifecycle lane. `pending` = PENDING + BLOCKED (exclude TESTED);
   * `tested` = TESTED only. Omit for station embeds (all lanes + `?ustatus`).
   */
  fulfillmentLane?: 'pending' | 'tested';
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
function assignmentPatchFromEvent(detail: any): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const {
    testerId,
    packerId,
    testerName,
    packerName,
    deadlineAt,
    outOfStock,
    notes,
    itemNumber,
    condition,
  } = detail || {};

  if (testerId !== undefined) {
    patch.tester_id = testerId;
    patch.tester_name = testerName ?? null;
    patch.tested_by_name = testerName ?? null;
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
  if (notes !== undefined) patch.notes = notes;
  if (itemNumber !== undefined) patch.item_number = itemNumber;
  if (condition !== undefined) patch.condition = condition;
  if (detail?.shippingTrackingNumber !== undefined) patch.shipping_tracking_number = detail.shippingTrackingNumber;

  return patch;
}

export function UnshippedTable({
  packedBy,
  testedBy,
  strictSearchScope = false,
  searchEmptyTitle = 'No orders found',
  searchResultLabel = 'orders to ship',
  clearSearchLabel = 'Show All Pending Orders',
  selectMode = false,
  railSelection = false,
  onOpenRecord,
  fulfillmentLane,
  onPrimaryPainted,
}: UnshippedTableProps = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const searchQuery = String(searchParams.get('search') || '').trim();
  // Non-scan-critical: keep the prior list paintable while the typed query catches up.
  const deferredSearchQuery = useDeferredValue(searchQuery);
  // Fulfillment queue stages: pending (not tested) and tested (packing now).
  const stageParam = String(searchParams.get('stage') || 'all').toLowerCase();

  // Legacy `?stage=awaiting` → Outbound · Labels (awaiting moved off Unshipped).
  useEffect(() => {
    if (stageParam !== 'awaiting') return;
    const params = new URLSearchParams();
    if (searchQuery) params.set('q', searchQuery);
    const qs = params.toString();
    router.replace(qs ? `${SHIPPING_PATH}?${qs}` : SHIPPING_PATH, { scroll: false });
  }, [stageParam, searchQuery, router]);

  const stageFilter: 'all' | 'pending' | 'tested' | 'packed' =
    stageParam === 'pending' ? 'pending'
      : stageParam === 'tested' ? 'tested'
        : stageParam === 'packed' ? 'packed'
          : 'all';
  // Click-to-filter from the status legend (`?ustatus`) — exact derived pre-dock
  // state. Composes on top of the coarse `?stage` facet.
  const statusFilter = String(searchParams.get('ustatus') || '').trim().toUpperCase() as FulfillmentState | '';
  // Urgent-only board filter — operator-flagged expedited rows (orders.is_urgent).
  // Wire param is still `attention` (kept for deep-link / saved-pref stability);
  // its meaning is now "urgent only", not the legacy blocked ∪ late fire queue.
  const urgentOnly =
    searchParams.get('attention') === '1' || searchParams.get('attention') === 'true';
  /** Must-ship / overdue — days past ship-by ≥ 0 (due today or late). */
  const lateOnly =
    searchParams.get('late') === '1' || searchParams.get('late') === 'true';
  /** Exception row flag refine (`?rowFlag=awaiting_customer`). */
  const rowFlagFilter = String(searchParams.get('rowFlag') || '').trim().toLowerCase();
  /**
   * CAGED facet (`?cage=1`). Unlike every other facet this swaps the DATA
   * SOURCE rather than narrowing the queue: `/api/orders?fulfillmentScope=true`
   * requires a shipment and a tracking number, so a caged order — caged
   * precisely because facts like tracking are still missing — is not in that
   * payload at all and no client-side predicate could find it.
   */
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

  // Phase 2 pagination — a growing row ceiling. "Load more" bumps it; any filter
  // change resets it. A search stays unbounded (results are already the matches).
  const [rowLimit, setRowLimit] = useState(200);
  useEffect(() => {
    setRowLimit(200);
  }, [
    stageFilter,
    staffId,
    searchQuery,
    statusFilter,
    urgentOnly,
    lateOnly,
    rowFlagFilter,
    packPlacedOnly,
    packStationId,
    cagedOnly,
  ]);

  const query = useQuery({
    ...unshippedOrdersQuery({
      searchQuery: deferredSearchQuery,
      packedBy,
      testedBy,
      staffId,
      strictSearchScope,
      // Coarse stage facet now filtered SERVER-side (Phase 1). Absent = all.
      stage: stageFilter === 'all' ? undefined : stageFilter,
      // Bounded page (Phase 2); search stays unbounded.
      limit: deferredSearchQuery ? undefined : rowLimit,
    }),
    // Keep rows visible while search/stage refetch, but never bleed the previous
    // staff scope into a new one — that made ?staff= look like it wasn't filtering.
    placeholderData: (previousData, previousQuery) => {
      const prev = previousQuery?.queryKey?.[2] as { staffId?: number } | undefined;
      if (prev?.staffId !== staffId) return undefined;
      return previousData;
    },
    // The live queue is not what the Caged facet shows, so do not pay for it.
    // The key stays cached, so switching back repaints from cache.
    enabled: !cagedOnly,
  });

  const cagedQuery = useQuery({ ...cagedOrdersQuery(), enabled: cagedOnly });
  const cagedRows = useMemo(
    () => (cagedQuery.data?.orders ?? []).map(cagedRecordToQueueRow),
    [cagedQuery.data],
  );

  /*
   * The fourth settled state (loading → absence → no-match → **degraded**).
   *
   * This feed read `data` / `isLoading` / `isSuccess` and never `isError`, so a
   * failed queue read fell through to `EMPTY_UNSHIPPED_ROWS` and painted the
   * settled-empty board: "your warehouse is clear" and "we could not reach the
   * server" were the same screen. On the one surface where that answer decides
   * whether an operator stops working, it has to be two screens.
   *
   * Two faces, per `GridDegradedBox`'s own contract: nothing to show ⇒ the
   * rose box REPLACES the board; rows already painted (seed, cache, a prior
   * page) ⇒ keep them and say the refresh failed. A background refetch error
   * must never blank a surface the operator is mid-scan on.
   */
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
    enabled: !deferredSearchQuery,
  });

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
        testerId: d.testerId,
        packerId: d.packerId,
        testerName: d.testerName,
        packerName: d.packerName,
        deadlineAt: d.deadlineAt,
        shippingTrackingNumber: d.shippingTrackingNumber,
      };

      const hasAnyChange =
        detail.testerId !== undefined ||
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

  // Pending-stage rows live in this merged queue too, so reflect tech-test
  // verdicts (has_tech_scan) in place — a tracking scan at the bench moves the
  // row pending → tested and the status chip morphs under the operator's eye.
  //
  // The patch itself is `patchUnshippedOrderTested` (cache SoT), not inline:
  // `useRealtimeInvalidation` runs the same helper for the desk surfaces that
  // read this cache WITHOUT mounting this table (compare panes, drill host).
  // Both subscriptions firing is fine and deliberate — the /tech embed has no
  // dashboard hook above it, and the second patch is identity-preserving, so
  // it costs a comparison rather than a re-render.
  //
  // NOT frame-coalesced: this handler reads its payload, and `coalesce:'frame'`
  // is last-wins, so two benches scanning in the same frame would patch one row
  // and silently drop the other.
  useAblyChannel(
    ordersChannelName,
    'order.tested',
    (message: any) => {
      patchUnshippedOrderTested(queryClient, message?.data ?? {});
    },
    !!ordersChannelName,
  );

  useEffect(() => {
    const handleAssignmentUpdated = (e: any) => {
      const detail = e?.detail || {};
      const orderIds = Array.isArray(detail.orderIds) ? detail.orderIds : [];
      if (orderIds.length === 0) return;

      const hasAnyChange =
        detail.testerId !== undefined ||
        detail.packerId !== undefined ||
        detail.deadlineAt !== undefined ||
        detail.outOfStock !== undefined ||
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

    window.addEventListener('order-assignment-updated' as any, handleAssignmentUpdated as any);

    return () => {
      window.removeEventListener('order-assignment-updated' as any, handleAssignmentUpdated as any);
    };
  }, [queryClient]);

  useRefreshSignal('orders.outbound', () => {
    void queryClient.refetchQueries({ queryKey: ['dashboard-table', 'unshipped'] });
    invalidateUnshippedCounts(queryClient);
  });

  // Stable across renders: both callbacks feed `useOrdersSpreadsheet`, which is
  // where the grouped row model is built. A fresh closure per render there is the
  // same defeat-the-memo problem as an unmemoized `records`.
  const clearSearch = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('search');
    const nextSearch = params.toString();
    const nextPath = pathname || '/shipping/orders';
    router.replace(nextSearch ? `${nextPath}?${nextSearch}` : nextPath);
  }, [searchParams, pathname, router]);

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
      dispatchOpenShippedDetails(record, 'queue');
    },
    [cagedOnly, onOpenRecord, router, searchParams],
  );

  const allRecords = cagedOnly ? cagedRows : (query.data ?? EMPTY_UNSHIPPED_ROWS);
  // `?stage` is filtered SERVER-side; dashboard tabs no longer force a lane —
  // stage is a row fact. Optional `fulfillmentLane` remains for station embeds.
  // Facets: `?attention=1` (urgent), `?late=1` (must ship), `?ustatus`, `?rowFlag`.
  //
  // Memoized because this list is the input to the grouped row model below it —
  // an unmemoized re-derive here re-identifies every row on every render.
  const todayKey = getCurrentPSTDateKey();
  const laneRecords = useMemo(
    () =>
      // The caged set is already the answer — the server returned exactly the
      // held rows. Running the queue's predicates over it would drop every one
      // of them on the first line (`if (!tracking) return false`), which is the
      // very reason they are invisible today.
      cagedOnly
        ? allRecords
        : allRecords.filter((r) => {
        const row = r as {
          has_tech_scan?: boolean;
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
        /*
         * NO tracking gate (2026-08-30). This line used to drop every untracked
         * row — `if (!tracking) return false` — which is what made "needs a
         * label" a separate table instead of a state. Those rows now ride the
         * queue and paint the `Needs label` pill (AWAITING_LABEL), so the
         * operator sees their own intake instead of it disappearing.
         *
         * `tracking` is still read below by nothing here: the lifecycle stage
         * derives from `shipment_id`, which is the fact the pill needs.
         */
        const packedAt = row.packed_at || row.pack_activity_at || null;
        const lifecycle = resolveOrderLifecycleStage({
          shipmentId: row.shipment_id,
          hasTechScan: Boolean(row.has_tech_scan),
          isOutOfStock: Boolean(row.is_out_of_stock),
          packedAt,
        });
        const state = deriveFulfillmentState({
          hasTechScan: Boolean(row.has_tech_scan),
          isOutOfStock: Boolean(row.is_out_of_stock),
        });

        if (fulfillmentLane === 'tested') {
          if (lifecycle === 'PACKED_STAGED') return false;
          if (state !== 'TESTED') return false;
        } else if (fulfillmentLane === 'pending') {
          if (lifecycle === 'PACKED_STAGED') return false;
          if (state === 'TESTED') return false;
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
        }

        if (urgentOnly && !row.is_urgent) return false;

        if (lateOnly) {
          const deadlineKey = toPSTDateKey(row.deadline_at || row.ship_by_date || null);
          // Must ship = ship-by is today or past (PST civil). No deadline → not must-ship.
          if (!deadlineKey || !todayKey || deadlineKey > todayKey) return false;
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
      urgentOnly,
      lateOnly,
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

  // Copy acts on the SELECTION, and the shape it copies is the shipped
  // order-export shape rather than the on-screen column set: a pasted order row
  // has to carry the identity fields (record id, SKU, platform) that make it
  // useful away from the app, and half the visible tracks are chips and icons
  // with no text to copy.
  const copyExport = useMemo(
    () => ({
      columns: [...ORDER_EXPORT_COLUMNS],
      toRow: (row: ShippedOrder) => buildOrderExportRow(row),
    }),
    [],
  );

  // First-run teaching state: a brand-new org with zero unshipped orders and no
  // active search/filter sees the "connect a sales channel" CTA instead of three
  // empty lanes that read as broken. Any active search/status/staff filter falls
  // through to the board, which owns its own typed "no matches" empty per lane.
  const isFirstRunEmpty =
    // An empty cage is not a brand-new org — showing "connect a sales channel"
    // there would answer a question nobody asked.
    !cagedOnly &&
    // Neither is an unreachable server. This was the worst face of the missing
    // error branch: a failed read on an established org taught it to set itself
    // up. The degraded gate below catches it first; this keeps the teaching
    // state honest on its own terms.
    !queueError &&
    !query.isLoading &&
    allRecords.length === 0 &&
    !searchQuery &&
    !statusFilter &&
    !urgentOnly &&
    stageFilter === 'all' &&
    staffId === undefined;

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

  // Phase 2 "Load more": the stage-aware total (server, dedup-independent) exceeds
  // the loaded ceiling ⇒ more rows exist. Bumping the ceiling refetches the wider
  // page. Hidden during search (results are already the full match set).
  // A dashboard LANE (`fulfillmentLane`) is the PENDING/TESTED/BLOCKED mapping,
  // so its total comes from the lane SoT — `byStage` is the RAW hasTechScan
  // split and adding BLOCKED to it double-counts every untested blocked order.
  // A `?stage=` facet IS that raw split (the server filters on it), so those
  // two branches keep reading `byStage`.
  const laneTotals = fulfillmentLaneTotals(queueCounts);
  const stageTotal =
    fulfillmentLane === 'pending'
      ? laneTotals.pending
      : fulfillmentLane === 'tested'
        ? laneTotals.tested
        : stageFilter === 'pending'
          ? (queueCounts?.byStage.pending ?? 0)
          : stageFilter === 'tested'
            ? (queueCounts?.byStage.tested ?? 0)
            : stageFilter === 'packed'
              ? (queueCounts?.byStage as { packed?: number } | undefined)?.packed ??
                records.length
              : (queueCounts?.total ?? 0);
  // The caged endpoint returns the whole held set (bounded at 500) in one
  // read, so there is no second page to offer.
  // The control moved INTO the status bar's count sentence. It used to be a
  // band below the bar carrying its own "Showing N of M" against a different
  // denominator than the bar's — two answers to "how many are left", stacked.
  // It also mounted after first paint, shoving the last data row down while the
  // operator was already reading.
  const showLoadMore = !cagedOnly && !searchQuery && stageTotal > rowLimit;
  const onLoadMore = showLoadMore ? () => setRowLimit((n) => n + 200) : undefined;

  return (
    <UnshippedSheet
      records={records}
      loading={cagedOnly ? cagedQuery.isLoading : query.isLoading}
      searchValue={searchQuery}
      selectMode={selectMode}
      railSelection={railSelection}
      onOpenRecord={handleOpenRecord}
      onClearSearch={clearSearch}
      searchEmptyTitle={searchEmptyTitle}
      searchResultLabel={searchResultLabel}
      clearSearchLabel={clearSearchLabel}
      onLoadMore={onLoadMore}
      copyExport={copyExport}
      stale={queueError}
      onRetryStale={retryQueue}
    />
  );
}

/**
 * Refresh failed while rows are already on screen — the non-blocking half of
 * the degraded state.
 *
 * The rows stay. What changes is that the desk stops implying they are current:
 * an operator reading a queue that quietly stopped updating is the same failure
 * as the empty board, just slower. `role="status"` because it must reach a
 * screen-reader operator who cannot see the band appear, and `polite` because
 * it interrupts nothing — the rows below are still workable.
 */
function QueueStaleBand({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="status"
      data-testid="to-ship-stale-band"
      className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border-danger bg-surface-danger px-2 py-1 text-role-caption text-text-danger"
    >
      <RefreshCw aria-hidden className="h-3.5 w-3.5 shrink-0" />
      <span>Couldn&apos;t refresh — showing the last rows that loaded.</span>
      <Button type="button" size="sm" variant="ghost" onClick={onRetry} className="text-text-danger">
        Retry
      </Button>
    </div>
  );
}

/**
 * Unshipped · Pending sheet — the To Ship fulfillment queue as a single
 * connected spreadsheet (`useOrdersSpreadsheet` → {@link NonlinearTableHost} →
 * `LedgerGridSurface`). One grid surface, no Board|Grid switcher: search renders
 * the same grid over filtered records.
 *
 * Local to this file on purpose. The feed above gates a brand-new org onto
 * `OrdersFirstRunEmptyState` BEFORE any grid mounts, so the spreadsheet hook
 * (which publishes a grid-priority record cursor) has to sit behind that gate
 * rather than run unconditionally in the feed. The old `UnshippedShelfBoard`
 * module was deleted into this component
 * (`docs/todo/one-table-engine-orders-host-PLAN.md` §5.2); its `selectedId`
 * state and `open/close-shipped-details` bridge came with it and are gone —
 * nothing ever read that value.
 *
 * Workbench contract: URL-addressable selection (`?openOrderId`) + right-pane
 * detail. Do not refactor onto SidebarRailShell (single-list rail engine).
 *
 * Scroll: {@link DataTable} is a flex-fill column inside a definite flex chain
 * (Unbox golden) so the grid self-scrolls — one Y port, no absolute viewport
 * calc. Column header sticks inside the grid; no page-level sticky.
 */
function UnshippedSheet({
  records,
  loading,
  searchValue,
  onOpenRecord,
  onClearSearch,
  searchEmptyTitle = 'No orders found',
  searchResultLabel = 'orders to ship',
  clearSearchLabel = 'Show All Pending Orders',
  selectMode = false,
  railSelection = false,
  onLoadMore,
  copyExport,
  stale = false,
  onRetryStale,
}: {
  records: ShippedOrder[];
  loading: boolean;
  searchValue: string;
  onOpenRecord: (record: ShippedOrder) => void;
  onClearSearch: () => void;
  searchEmptyTitle?: string;
  searchResultLabel?: string;
  clearSearchLabel?: string;
  selectMode?: boolean;
  /** Rail-selection model: the check-set is the single selection SoT and drives
   *  the right-rail inspector (History / order-rail SoT). */
  railSelection?: boolean;
  /** Next page, drawn inside the status bar's count sentence. */
  onLoadMore?: () => void;
  copyExport: DataTableExport<ShippedOrder>;
  /** A read failed while these rows were already painted — see {@link QueueStaleBand}. */
  stale?: boolean;
  onRetryStale?: () => void;
}) {
  const sheet = useOrdersSpreadsheet({
    ariaLabel: 'Shelved unshipped orders',
    records,
    loading,
    searchValue,
    onOpenRecord,
    onCloseRecord: () => {
      dispatchCloseShippedDetails();
    },
    onClearSearch,
    selectMode,
    selectionScope: DASHBOARD_ORDERS_SELECTION_SCOPE,
    railSelection,
    queueMode: 'fulfillment',
    searchEmptyTitle,
    searchResultLabel,
    clearSearchLabel,
    'data-testid': 'pending-grid-body',
  });
  const chrome = useToShipChrome();
  // The corner names how many verbs the selection can run; the rail still owns
  // running them. Without this the bar advertised Copy and nothing else until
  // the operator happened to check a third row.
  const selectionActionCount = useRailActionCount();

  // The spreadsheet hook publishes the cursor (it owns grouping + folds);
  // this lane only turns the keyboard on.
  useRecordCursorKeyboard({ enabled: true, scope: 'record' });

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {stale && onRetryStale ? <QueueStaleBand onRetry={onRetryStale} /> : null}
      <DataTable<ShippedOrder, OrdersQueueColumnKey, OrdersQueueColumn>
        {...sheet}
        {...chrome}
        copyExport={copyExport}
        selectionActionCount={selectionActionCount}
        exportFilename="to-ship.csv"
      />
    </div>
  );
}
