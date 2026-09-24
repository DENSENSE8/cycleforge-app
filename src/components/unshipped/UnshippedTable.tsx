'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { getOrdersChannelName, safeChannelName } from '@/lib/realtime/channels';
import type { DashboardSearchSectionProps } from '@/components/dashboard/DashboardSearchSectionProps';
import { DataTable, downloadDataTableCsv, type DataTableExport } from '@/components/tables/DataTable';
import { SLOT_TABLE_PAGE_SIZES } from '@/lib/tables/slot-table-page';
import { useOrdersSpreadsheet } from '@/components/dashboard/orders-queue/useOrdersSpreadsheet';
import { OrderStatusTrailStage } from '@/components/orders/OrderStatusTrailOverlay';
import { useToShipChrome, type ToShipChrome } from '@/components/unshipped/useToShipChrome';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import {
  ORDER_EXPORT_COLUMNS,
  buildOrderExportRow,
} from '@/lib/dashboard/order-export-csv';
import { useRecordCursorKeyboard } from '@/hooks/useRecordCursorKeyboard';
import { OrdersFirstRunEmptyState } from '@/components/dashboard/OrdersFirstRunEmptyState';
import { orgHasActivity, useOnboardingStats } from '@/hooks/useOnboardingStats';
import { PackAwaitingFeedback } from '@/components/packer/PackAwaitingFeedback';
import { dispatchCloseShippedDetails, dispatchOpenShippedDetails } from '@/utils/events';
import { unshippedOrdersQuery, unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';
import { fetchUnshippedOrderRowById } from '@/lib/dashboard-table-data';
import {
  cagedOrdersQuery,
  cagedRecordToQueueRow,
} from '@/lib/queries/caged-orders-queries';
import { Button } from '@/design-system/primitives';
import { GridDegradedBox } from '@/design-system/components/grid';
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
  patchUnshippedOrderTested,
  invalidateUnshippedCounts,
  insertUnshippedOrderIntoCache,
} from '@/lib/queries/dashboard-cache-patch';
import { SHIPPING_PATH } from '@/components/outbound/outbound-sidebar-shared';
import { SHIPPING_ORDERS_PATH, ORDERS_DESK_CONTEXT_KEY, ORDERS_DESK_SUPPORT_CONTEXT, parseOrdersDeskContext } from '@/lib/shipping/orders-desk';
import type { ShippedOrder } from '@/types/orders';
import type {
  OrdersQueueColumn,
  OrdersQueueColumnKey,
} from '@/lib/dashboard-order-row-layout';
import { useRefreshSignal } from '@/lib/refresh/bus';
import { OrdersDeskLabelsAction } from '@/components/outbound/orders/paperwork/OrdersDeskLabelsAction';
import { PaperworkWalkHost } from '@/components/outbound/orders/paperwork/PaperworkWalkHost';
import { DeskExportMenuRegistrar } from '@/design-system/components/DeskActionSlot';
import { PAPERWORK_PARAM, parsePaperworkOrderId } from '@/lib/orders/print-packet';
import { PACK_PLACED_PARAM, PACK_STATION_PARAM } from '@/lib/packing/pack-station-arm';
import { OutboundOrdersLedger } from '@/components/outbound/orders/OutboundOrdersLedger';

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
  /**
   * Pin this desk to ONE derived pre-dock state, whatever the URL says.
   *
   * The Pending (ex-Shortage) desk is the case this exists for. Its page has
   * always DOCUMENTED itself as "locked to BLOCKED rows", but nothing enforced
   * it: the mount passed no lane and no filter, so the desk actually painted
   * every unshipped order and its `?ustatus` came from whatever the last link
   * carried. A desk whose whole job is one lane cannot leave that lane to a
   * query parameter — the operator opens the tab and sees packed orders.
   *
   * It BEATS `?ustatus` rather than seeding it: a seeded param is one stray
   * link away from being wrong again, and this is the desk's identity, not a
   * refinement of it.
   */
  lockedFulfillmentState?: FulfillmentState;
  /**
   * Soft idle copy when the board has nothing to show (and when the fetch
   * failed with zero rows). Pack uses "Awaiting scan" instead of a red
   * degraded alert or a first-run sales-channel CTA.
   */
  awaitingMessage?: string;
  /** SSR stand-in handoff — primary queue has paintable rows (seed or fetch). */
  onPrimaryPainted?: () => void;
  /**
   * Paint the rows as the industrial record ledger (`OutboundOrdersLedger`)
   * instead of the slot `DataTable`. Only the To-ship desk sets it
   * (`DashboardOrdersView`); every other mount keeps the slot table. The feed,
   * filters, fetch and overlays above the sheet are identical either way.
   */
  ledger?: boolean;
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
  // The urgent toggle rides the same event as assignments (useOrderAssignment
  // dispatches isUrgent on every mutation). It was missing from BOTH the guard
  // and the patch, so clearing urgency 200'd at the API, toasted "Urgent
  // cleared"… and left the row yellow, the rail pulsing and the strip's
  // transition label stuck on "Clear urgent" — the cache never heard (operator
  // 2026-09-15, found through the relabelled pill).
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
  testedBy,
  strictSearchScope = false,
  searchEmptyTitle = 'No orders found',
  searchResultLabel = 'orders to ship',
  clearSearchLabel = 'Show All Pending Orders',
  selectMode = false,
  railSelection = false,
  onOpenRecord,
  fulfillmentLane,
  lockedFulfillmentState,
  awaitingMessage,
  onPrimaryPainted,
  ledger = false,
}: UnshippedTableProps = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const orgId = user?.organizationId;
  // Fulfillment queue stages: pending (not tested) and tested (packing now).
  const stageParam = String(searchParams.get('stage') || 'all').toLowerCase();

  // Legacy `?stage=awaiting` → Outbound · Labels (awaiting moved off Unshipped).
  useEffect(() => {
    if (stageParam !== 'awaiting') return;
    router.replace(SHIPPING_PATH, { scroll: false });
  }, [stageParam, router]);

  const stageFilter: 'all' | 'pending' | 'tested' | 'packed' =
    stageParam === 'pending' ? 'pending'
      : stageParam === 'tested' ? 'tested'
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
  const openOrderIdRaw = searchParams.get('openOrderId');
  const openOrderIdValue = Number(openOrderIdRaw);
  const openOrderId =
    Number.isFinite(openOrderIdValue) && openOrderIdValue > 0 ? openOrderIdValue : null;
  const paperworkId = parsePaperworkOrderId(searchParams.get(PAPERWORK_PARAM));
  const [walkIds, setWalkIds] = useState<number[] | null>(null);
  const { rows: selectedRailRows } = useRailActionSnapshot();
  const isSupportContext =
    parseOrdersDeskContext(searchParams.get(ORDERS_DESK_CONTEXT_KEY)) ===
    ORDERS_DESK_SUPPORT_CONTEXT;
  const fetchWindow: number = SLOT_TABLE_PAGE_SIZES[SLOT_TABLE_PAGE_SIZES.length - 1];
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
  ]);


  /**
   * The desk's chrome — lifted HERE, above the sheet that draws it, because the
   * find field is now part of the QUERY.
   *
   * It used to be resolved inside `UnshippedSheet`, one component below the
   * fetch, which is exactly why the search could only ever narrow the page in
   * memory: the value never reached the thing that decides which orders arrive.
   * To-ship holds a bounded page (`limit: 200` + "load more") of ~4.8k orders,
   * so an order on page 3 answered "No orders found" while sitting in the
   * warehouse. `/api/orders?q=` already searches the whole in-warehouse scope
   * UNBOUNDED (`fetchUnshippedOrdersData` drops `listShape` / `stage` / `limit`
   * when `q` is present) — the plumbing was there, unplugged.
   *
   * The value stays session-local state (`useDashboardSearchController`); it is
   * spent on a react-query key, never on `router.replace`, so the table is not
   * remounted per keystroke (DataTable rule 3).
   */
  const chrome = useToShipChrome({ blockedQueue: lockedFulfillmentState === 'BLOCKED' });
  const searchQuery = chrome.search.value;

  const query = useQuery({
    ...unshippedOrdersQuery({
      // The find text IS part of the fetch now. `fetchUnshippedOrdersData`
      // reads it as `?q=` and, while it is set, drops `listShape` / `stage` /
      // `limit` so the match runs over the whole in-warehouse scope instead of
      // over whichever 200 rows happened to be loaded.
      searchQuery,
      packedBy,
      testedBy,
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
  // A URL dossier can name a row outside the bounded first page. Fetch that
  // single queue member and merge it into the same row collection so the
  // engine's existing `scrollToKey` contract can select its page.
  const deepLinkQuery = useQuery({
    queryKey: ['dashboard-table', 'unshipped-deep-link', { openOrderId, staffId }],
    queryFn: () => fetchUnshippedOrderRowById({ orderId: openOrderId as number, staffId }),
    enabled: !cagedOnly && openOrderId != null,
    staleTime: 60_000,
    gcTime: 15 * 60 * 1000,
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
    const handleAssignmentUpdated = (e: Event) => {
      const detail = (e instanceof CustomEvent ? e.detail : null) || {};
      const orderIds = Array.isArray(detail.orderIds) ? detail.orderIds : [];
      if (orderIds.length === 0) return;

      const hasAnyChange =
        detail.testerId !== undefined ||
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

  useRefreshSignal('orders.outbound', () => {
    void queryClient.refetchQueries({ queryKey: ['dashboard-table', 'unshipped'] });
    invalidateUnshippedCounts(queryClient);
  });


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
        } else if (stageFilter === 'pending') {
          if (lifecycle === 'PACKED_STAGED') return false;
          if (state === 'TESTED') return false;
        } else if (stageFilter === 'tested') {
          if (state !== 'TESTED') return false;
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

  /**
   * Tracking-hover **Label** door (`useOrdersSpreadsheet.onOpenLabels`) — the
   * third entrance the walk documents, beside the header CTA and the selection
   * bar. It opens ON the hovered row instead of the head of the queue, and the
   * step list stays the whole visible queue so Next keeps walking from there.
   *
   * The chain (CompoundFulfillment → CompoundGridCell → OrdersQueueTableRow →
   * useOrdersSpreadsheet) was already plumbed; only this last hop was missing,
   * so the menu painted Open with no Label and the e2e that pins the door sat
   * behind a `rowCount === 0` skip.
   */
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

  const retreatPaperworkWalk = useCallback(() => {
    const list = walkRows.length > 0 ? walkRows : records;
    const current = Number(paperworkId);
    const idx = list.findIndex((r) => orderIdOf(r) === current);
    const prev = idx > 0 ? list[idx - 1] : null;
    if (!prev) return;
    patchPaperwork(orderIdOf(prev));
  }, [paperworkId, patchPaperwork, records, walkRows]);

  const handlePaperworkFactsChanged = useCallback(() => {
    invalidateUnshippedCounts(queryClient);
    void queryClient.invalidateQueries({ queryKey: ['paperwork-manuals'] });
  }, [queryClient]);

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

  // First-run teaching state: a brand-new org sees the "connect a sales
  // channel" CTA instead of three empty lanes that read as broken. Any active
  // search/status/staff filter falls through to the board, which owns its own
  // typed "no matches" empty per lane. Pack (and similar embeds) pass
  // `awaitingMessage` so idle / failed-empty reads as "Awaiting scan" — never a
  // rose degraded alert.
  const isIdleEmpty =
    !query.isLoading &&
    allRecords.length === 0 &&
    !statusFilter &&
    !urgentOnly &&
    stageFilter === 'all' &&
    staffId === undefined;

  // An empty QUEUE is not an empty ORG (operator 2026-09-14). This used to be
  // `isIdleEmpty` alone, so `/shipping/orders` told an org with 4,422 orders
  // and three live integrations to "connect a sales channel" the moment its
  // to-ship lane drained — the one screen that must never read as unconfigured,
  // because the operator's next move is to import, not to onboard.
  //
  // The org-level fact already exists (`GET /api/onboarding/stats`); the queue
  // result set cannot answer this question and never could.
  const onboarding = useOnboardingStats();
  const hasActivity = orgHasActivity(onboarding.data);

  const isFirstRunEmpty =
    // An empty cage is not a brand-new org — showing "connect a sales channel"
    // there would answer a question nobody asked.
    !cagedOnly &&
    // Neither is an unreachable server. This was the worst face of the missing
    // error branch: a failed read on an established org taught it to set itself
    // up. The degraded gate below catches it first; this keeps the teaching
    // state honest on its own terms.
    !queueError &&
    isIdleEmpty &&
    // UNKNOWN is not new. While the stats load — or if they fail — the ordinary
    // empty stands. Teaching setup to an org we cannot prove is fresh is the
    // exact defect above, and defaulting to it on a network blip would
    // reintroduce it.
    hasActivity === false;

  // Labels / export hooks MUST sit above the empty/awaiting/degraded early
  // returns. Callers: DashboardOrdersView / Pack embeds mount UnshippedTable.
  // Affected API: toggleLabelsWalk, runExport refs. Schema: none.
  // User: "Rendered fewer hooks… Still getting this on the two ship page."
  // Loading → first-run empty skipped these hooks and crashed the route.
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
    lockedFulfillmentState === 'BLOCKED'
      ? laneTotals.blocked
      : fulfillmentLane === 'pending'
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
  // A SEARCH is already unbounded, so there is no next page to fetch — and
  // `stageTotal` counts the unsearched lane, so leaving the control up would
  // offer "load more" against a denominator the search does not use.
  const showLoadMore = !cagedOnly && !searchQuery.trim() && stageTotal > rowLimit;
  const onLoadMore = showLoadMore ? () => setRowLimit((n) => n + fetchWindow) : undefined;

  const labelsCta = onToShipDesk ? (
    <OrdersDeskLabelsAction
      incompleteCount={queueCounts?.paperworkIncomplete ?? 0}
      walkOpen={paperworkId != null}
      disabled={records.length === 0}
      onToggle={toggleLabelsWalk}
    />
  ) : null;
  const exportMenu = onToShipDesk ? (
    <DeskExportMenuRegistrar
      run={runExport}
      rowCount={records.length}
      empty={records.length === 0}
    />
  ) : null;

  return (
    <>
      {labelsCta}
      {exportMenu}
      {/*
        Q5 stage. Walk + STATUS trail are SIBLINGS of the sheet inside
        {@link OrderStatusTrailStage}'s `relative` box, never a body swap.
        {@link PaperworkWalkHost} is a `fill="stage"` DeskStageOverlay
        (`absolute inset-0`), so it needs a positioned box the size of the
        table to cover, and Center Lock says the DataTable stays mounted
        underneath it. Swapping the body instead unmounted the grid — the
        operator lost scroll position, cursor and check-set on every Labels
        press, and the walk's own `?paperwork=` exit remounted a cold table.

        The wrapper is unconditional on purpose. Adding it only while the walk
        is open would move `UnshippedSheet` in the tree and remount the grid —
        the table flash `tests/e2e/to-ship-paperwork-walk.spec.ts` pins.
      */}
      <OrderStatusTrailStage>
        {ledger ? (
          <OutboundOrdersLedger
            chrome={chrome}
            searchPending={!cagedOnly && query.isFetching}
            records={records}
            loading={cagedOnly ? cagedQuery.isLoading : query.isLoading}
            onOpenRecord={handleOpenRecord}
            onCloseRecord={dispatchCloseShippedDetails}
            railSelection={railSelection}
            onLoadMore={onLoadMore}
            banner={queueError ? <QueueStaleBand onRetry={retryQueue} /> : null}
            searchEmptyTitle={searchEmptyTitle}
            searchResultLabel={searchResultLabel}
            clearSearchLabel={clearSearchLabel}
            onOpenLabels={onToShipDesk ? openLabelsWalkForRecord : undefined}
          />
        ) : (
        <UnshippedSheet
          chrome={chrome}
          searchPending={!cagedOnly && query.isFetching}
          records={records}
          loading={cagedOnly ? cagedQuery.isLoading : query.isLoading}
          selectMode={selectMode}
          railSelection={railSelection}
          onOpenRecord={handleOpenRecord}
          searchEmptyTitle={searchEmptyTitle}
          searchResultLabel={searchResultLabel}
          clearSearchLabel={clearSearchLabel}
          onLoadMore={onLoadMore}
          copyExport={copyExport}
          copyExportPlacement={onToShipDesk ? 'menu' : 'header'}
          onOpenLabels={onToShipDesk ? openLabelsWalkForRecord : undefined}
          stale={queueError}
          onRetryStale={retryQueue}
          shortageDesk={lockedFulfillmentState === 'BLOCKED'}
        />
        )}
        {paperworkId != null && onToShipDesk ? (
          <PaperworkWalkHost
            rows={walkRows.length > 0 ? walkRows : records}
            selectedId={paperworkId}
            loading={query.isLoading}
            onSelect={patchPaperwork}
            onAdvance={advancePaperworkWalk}
            onPrev={retreatPaperworkWalk}
            onExit={closePaperworkWalk}
            onFactsChanged={handlePaperworkFactsChanged}
          />
        ) : null}
      </OrderStatusTrailStage>
    </>
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
  chrome,
  searchPending,
  records,
  loading,
  onOpenRecord,
  searchEmptyTitle = 'No orders found',
  searchResultLabel = 'orders to ship',
  clearSearchLabel = 'Show All Pending Orders',
  selectMode = false,
  railSelection = false,
  onLoadMore,
  copyExport,
  copyExportPlacement = 'header',
  onOpenLabels,
  stale = false,
  onRetryStale,
  shortageDesk = false,
}: {
  /**
   * Resolved by the FEED above, not here: the find field is an input to the
   * fetch, so the component that owns the fetch has to own the value. See the
   * docblock on the `useToShipChrome` call in {@link UnshippedTable}.
   */
  chrome: ToShipChrome;
  /** The queue fetch for the CURRENT find text is still running. */
  searchPending: boolean;
  records: ShippedOrder[];
  loading: boolean;
  onOpenRecord: (record: ShippedOrder) => void;
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
  copyExportPlacement?: 'header' | 'menu';
  /** Tracking-hover Label → paperwork walk. Omitted off the To-ship desk. */
  onOpenLabels?: (record: ShippedOrder) => void;
  /** A read failed while these rows were already painted — see {@link QueueStaleBand}. */
  stale?: boolean;
  onRetryStale?: () => void;
  /** Pending (ex-Shortage) desk — coverage column, blocked chrome total. */
  shortageDesk?: boolean;
}) {
  const sheet = useOrdersSpreadsheet({
    ariaLabel: shortageDesk ? 'Pending out-of-stock orders' : 'Shelved unshipped orders',
    records,
    loading,
    searchValue: chrome.search.value,
    // `/api/orders?q=` ran the match over the whole scope; `records` ARE the
    // hits. Re-running `filterShippedOrdersByQuery` over them would narrow the
    // server's answer by a rule that reads fewer facts.
    searchAnsweredBy: 'server',
    onOpenRecord,
    onCloseRecord: () => {
      dispatchCloseShippedDetails();
    },
    onClearSearch: () => chrome.search.onChange(''),
    selectMode,
    selectionScope: DASHBOARD_ORDERS_SELECTION_SCOPE,
    railSelection,
    queueMode: 'fulfillment',
    shortageDesk,
    searchEmptyTitle,
    searchResultLabel,
    clearSearchLabel,
    onOpenLabels,
    'data-testid': 'pending-grid-body',
  });

  // The spreadsheet hook publishes the cursor (it owns grouping + folds);
  // this lane only turns the keyboard on.
  useRecordCursorKeyboard({ enabled: true, scope: 'record' });

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {stale && onRetryStale ? <QueueStaleBand onRetry={onRetryStale} /> : null}
      <DataTable<ShippedOrder, OrdersQueueColumnKey, OrdersQueueColumn>
        {...sheet}
        {...chrome}
        search={{ ...chrome.search, answeredBy: 'server', pending: searchPending }}
        copyExport={copyExport}
        copyExportPlacement={copyExportPlacement}
        exportFilename="to-ship.csv"
        onLoadMore={onLoadMore}
      />
    </div>
  );
}
