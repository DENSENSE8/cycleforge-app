'use client';

import { useCallback, useMemo } from 'react';
import { getCurrentPSTDateKey, getDaysLateNullable } from '@/utils/date';
import { useStaffNameMap } from '@/hooks/useStaffNameMap';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { filterShippedOrdersByQuery } from '@/lib/orders/filter-painted-orders';
import type { TableId } from '@/lib/tables/table-columns';
import { useQueueDisplaySort } from '@/hooks/useQueueDisplaySort';
import { outboundSavedViewsConfig } from '@/components/unshipped/outbound-sidebar-shared';
import {
  QUEUE_DISPLAY_SORT_OPTIONS,
  flipQueueDisplaySortDir,
  isQueueColumnSort,
  isQueueNamePinSort,
  queueCarrierSortOptions,
  queueChannelSortOptions,
  queueColumnSortOptions,
  queueDisplaySortFace,
  type QueueDisplaySort,
  type QueueDisplaySortDir,
} from '@/utils/queue-display-sort';
import { normalizePersonName, type OrdersQueueMode, type QueueRowRecord } from './helpers';
import { useOrdersQueueRows } from './useOrdersQueueRows';
import {
  catalogIdsFromOrderRecords,
  emptyKitCompositionMap,
  useKitCompositionMap,
} from '@/hooks/useKitCompositionMap';
import { useOrdersQueuePlane, type OrdersQueuePlane } from './useOrdersQueuePlane';
import type { KitComposition } from '@/lib/orders/order-kit-composition';
import type { DataTableSortOption } from '@/components/tables/DataTable';
import type { RowGroup } from '@/lib/group-rows';
import { useOrderAssignment } from '@/hooks/useOrderAssignment';
import { refreshDomain } from '@/lib/refresh/bus';
import { toast } from '@/lib/toast';
import { useRecentImportedOrders } from '@/lib/orders/recent-imports';

/** `getDaysLateNullable`, memoized on `(today, deadline)`. */
const DAYS_LATE_CACHE = new Map<string, number | null>();

export function daysLateOn(todayKey: string, deadlineAt: string | null | undefined): number | null {
  const key = `${todayKey}\u0000${deadlineAt ?? ''}`;
  const cached = DAYS_LATE_CACHE.get(key);
  if (cached !== undefined) return cached;
  const value = getDaysLateNullable(deadlineAt);
  // Bounded: one entry per distinct deadline string per civil day. Dropping the
  // whole map on overflow is fine — it is a cache, not state.
  if (DAYS_LATE_CACHE.size > 4096) DAYS_LATE_CACHE.clear();
  DAYS_LATE_CACHE.set(key, value);
  return value;
}

/** Who picks / packs a queue row — display faces plus the assign ids. */
interface QueueRowStaff {
  testerDisplay: string;
  packerDisplay: string;
  testerId: number | null;
  packerId: number | null;
}

/** Wire names first, then the staff-name map — the one resolution every renderer shares. */
export function queueRowStaff(
  r: QueueRowRecord,
  getStaffName: (id: number) => string,
): QueueRowStaff {
  const testerName =
    String(r.tested_by_name ?? '').trim() ||
    String(r.tester_name ?? '').trim() ||
    (Number(r.tested_by) > 0 ? getStaffName(Number(r.tested_by)) : '') ||
    (Number(r.tester_id) > 0 ? getStaffName(Number(r.tester_id)) : '');
  const packerName =
    String(r.packed_by_name ?? '').trim() ||
    String(r.packer_name ?? '').trim() ||
    (Number(r.packed_by) > 0 ? getStaffName(Number(r.packed_by)) : '') ||
    (Number(r.packer_id) > 0 ? getStaffName(Number(r.packer_id)) : '');
  return {
    testerDisplay: normalizePersonName(testerName),
    packerDisplay: normalizePersonName(packerName),
    testerId:
      Number(r.tester_id) > 0 ? Number(r.tester_id) : Number(r.tested_by) > 0 ? Number(r.tested_by) : null,
    packerId:
      Number(r.packer_id) > 0 ? Number(r.packer_id) : Number(r.packed_by) > 0 ? Number(r.packed_by) : null,
  };
}

interface UseOrdersQueueFeedOptions {
  records: ShippedOrder[];
  searchValue: string;
  /** See `UseOrdersSpreadsheetOptions.searchAnsweredBy`. */
  searchAnsweredBy: 'client' | 'server';
  onOpenRecord: (record: ShippedOrder) => void;
  onCloseRecord?: (record: ShippedOrder | null) => void;
  selectionScope: string;
  railSelection: boolean;
  queueMode: OrdersQueueMode;
  tableId: TableId;
  /** Record-cursor surface id (the shell's test id). */
  surfaceId: string;
  /**
   * Re-cuts the groups the presenter shows AND the record cursor walks (the
   * card list's status chips and ship-by sections), so J / K follow the screen
   * and never step onto a hidden order. `orderGroupsByDate` comes back
   * arranged; `allOrderGroupsByDate` does not.
   */
  arrangeGroups?: (
    groups: [string, RowGroup<ShippedOrder>[]][],
    sort: QueueDisplaySort,
  ) => [string, RowGroup<ShippedOrder>[]][];
}

/** Inline-edit commit targets — one waist for every presenter. */
export interface OrdersQueueCommits {
  handleCommitCondition: (record: ShippedOrder, condition: string | null) => void;
  handleCommitShipBy: (record: ShippedOrder, dateKey: string | null) => void;
  handleCommitStageAssign: (
    record: ShippedOrder,
    fieldId: 'orders.picked' | 'orders.packed',
    staffId: number | null,
    staffName: string | null,
  ) => void;
  handleCommitSubtitleField: (record: ShippedOrder, fieldId: string, value: string | null) => void;
  /** Re-point an order imported under the wrong platform (`orders.account_source`). */
  handleCommitPlatform: (record: ShippedOrder, accountSource: string) => void;
  /** Set the SKU's home bin (`sku_stock.location`) — where this SKU is picked from. */
  handleCommitSkuBin: (record: ShippedOrder, locationBarcode: string) => void;
  /** Replace the order's primary carrier tracking # (assign waist → upsertOrderTracking). */
  handleCommitTracking: (record: ShippedOrder, tracking: string) => void;
}

interface OrdersQueueSortMenu {
  options: readonly DataTableSortOption[];
  active: QueueDisplaySort;
  hot: boolean;
  onSelect: (id: string) => void;
  activeFace: Pick<DataTableSortOption, 'label' | 'shortLabel' | 'identity'>;
}

interface OrdersQueueFeed extends OrdersQueueCommits {
  /** Warehouse civil today (`YYYY-MM-DD`), resolved once per render. */
  todayKey: string;
  getStaffName: (id: number) => string;
  sort: QueueDisplaySort;
  dir: QueueDisplaySortDir | null;
  setSort: (next: QueueDisplaySort, dir?: QueueDisplaySortDir | null) => void;
  recentImportedOrders: ReadonlyMap<number, string>;
  /** Rows this lane paints (search already applied when the client answers it). */
  painted: ShippedOrder[];
  /** The groups on screen — `arrangeGroups` applied. The record cursor walks these. */
  orderGroupsByDate: [string, RowGroup<ShippedOrder>[]][];
  /** Every group, unfiltered (counts that must not shrink with the filter). */
  allOrderGroupsByDate: [string, RowGroup<ShippedOrder>[]][];
  displayedRecords: ShippedOrder[];
  compositionMap: ReadonlyMap<number, KitComposition>;
  plane: OrdersQueuePlane;
  sortMenu: OrdersQueueSortMenu;
  views: { storageKey: string; paramKeys: readonly string[]; emptyHint: string } | undefined;
}

/** The outbound queue FEED — every data / behaviour hook an outbound lane needs, with no presentation: */
export function useOrdersQueueFeed({
  records,
  searchValue,
  searchAnsweredBy,
  onOpenRecord,
  onCloseRecord,
  selectionScope,
  railSelection,
  queueMode,
  tableId,
  surfaceId,
  arrangeGroups,
}: UseOrdersQueueFeedOptions): OrdersQueueFeed {
  // Resolved ONCE per render and threaded into every row's lateness lookup —
  // see `daysLateOn`.
  const todayKey = getCurrentPSTDateKey();
  const { getStaffName } = useStaffNameMap();
  const { sort, dir, setSort } = useQueueDisplaySort();
  const recentImportedOrders = useRecentImportedOrders();

  // `'server'` ⇒ the fetch already ran the match over the WHOLE scope; running
  // it again here could only drop rows the server deliberately returned.
  const painted = useMemo(
    () =>
      searchAnsweredBy === 'server'
        ? records
        : filterShippedOrdersByQuery(records, searchValue),
    [records, searchValue, searchAnsweredBy],
  );
  const { orderGroupsByDate: allOrderGroupsByDate, displayedRecords } = useOrdersQueueRows({
    records: painted,
    sort,
    dir,
    queueMode,
  });
  const orderGroupsByDate = useMemo(
    () => (arrangeGroups ? arrangeGroups(allOrderGroupsByDate, sort) : allOrderGroupsByDate),
    [allOrderGroupsByDate, arrangeGroups, sort],
  );

  const kitCatalogIds = useMemo(
    () => catalogIdsFromOrderRecords(displayedRecords),
    [displayedRecords],
  );
  const { data: kitCompositionMap } = useKitCompositionMap(kitCatalogIds);
  const compositionMap = kitCompositionMap ?? emptyKitCompositionMap();

  // Selection / cursor / inspector plane — the page concern (rail-selection SoT,
  // record cursor, external-open adoption, Labels replace-tracking).
  const plane = useOrdersQueuePlane({
    displayedRecords,
    orderGroupsByDate,
    onOpenRecord,
    onCloseRecord,
    selectionScope,
    railSelection,
    surfaceId,
    tableId,
  });

  // One inline-edit waist for every presenter (and the Shipped record).
  const {
    handleCommitCondition,
    handleCommitShipBy,
    handleCommitStageAssign,
    handleCommitSubtitleField,
    handleCommitPlatform,
    handleCommitSkuBin,
    handleCommitTracking,
  } = useOrdersQueueCommits();

  const handleSortMenuSelect = useCallback(
    (id: string) => {
      const next = id as QueueDisplaySort;
      // A name pin is a face, not a direction. Re-selecting "Amazon" must
      // keep Amazon on top — flipping would bury the name the operator chose.
      if (isQueueNamePinSort(next)) {
        setSort(next);
        return;
      }
      if (isQueueColumnSort(next) && sort === next && dir) {
        setSort(next, flipQueueDisplaySortDir(dir));
      } else {
        setSort(next);
      }
    },
    [sort, dir, setSort],
  );

  const sortMenuOptions = useMemo(
    () => [
      ...QUEUE_DISPLAY_SORT_OPTIONS,
      ...queueColumnSortOptions(),
      ...queueChannelSortOptions(),
      ...queueCarrierSortOptions(),
    ],
    [],
  );

  const sortMenu: OrdersQueueSortMenu = {
    options: sortMenuOptions,
    active: sort,
    hot: sort !== 'deadline',
    onSelect: handleSortMenuSelect,
    activeFace: queueDisplaySortFace(sort),
  };

  // The lane's saved views, resolved through the ONE outbound resolver so the toolbar menu and the rail's `OutboundSavedViewsList` cannot…
  const views =
    queueMode === 'fulfillment'
      ? {
          ...outboundSavedViewsConfig('unshipped'),
          emptyHint: 'Save a filter and sort combination to come back to it.',
        }
      : queueMode === 'shipped'
        ? {
            ...outboundSavedViewsConfig('shipped'),
            emptyHint: 'Save a filter and sort combination to come back to it.',
          }
        : undefined;

  return {
    todayKey,
    getStaffName,
    sort,
    dir,
    setSort,
    recentImportedOrders,
    painted,
    orderGroupsByDate,
    allOrderGroupsByDate,
    displayedRecords,
    compositionMap,
    plane,
    handleCommitCondition,
    handleCommitShipBy,
    handleCommitStageAssign,
    handleCommitSubtitleField,
    handleCommitPlatform,
    handleCommitSkuBin,
    handleCommitTracking,
    sortMenu,
    views,
  };
}

/** The outbound inline-edit commits — condition, ship-by, pick / pack assign, the under-title facts, platform, SKU bin, tracking — each… */
function useOrdersQueueCommits(): OrdersQueueCommits {
  // ONE mutation hook for the whole table (not one per row): every in-place
  // edit commits through the same `useOrderAssignment` waist — a scalar field
  // PATCH with the optimistic row update and rollback that hook already owns.
  const assignOrder = useOrderAssignment();
  const assignMutate = assignOrder.mutate;
  const handleCommitCondition = useCallback(
    (record: ShippedOrder, condition: string | null) => {
      const id = Number(record.id);
      if (!Number.isFinite(id)) return;
      assignMutate({ orderId: id, condition });
    },
    [assignMutate],
  );

  const handleCommitShipBy = useCallback(
    (record: ShippedOrder, dateKey: string | null) => {
      const id = Number(record.id);
      if (!Number.isFinite(id)) return;
      if (!dateKey) return;
      assignMutate({ orderId: id, shipByDate: dateKey });
    },
    [assignMutate],
  );

  const handleCommitStageAssign = useCallback(
    (
      record: ShippedOrder,
      fieldId: 'orders.picked' | 'orders.packed',
      staffId: number | null,
      staffName: string | null,
    ) => {
      const id = Number(record.id);
      if (!Number.isFinite(id)) return;
      if (fieldId === 'orders.picked') {
        assignMutate({ orderId: id, testerId: staffId, testerName: staffName });
        return;
      }
      assignMutate({ orderId: id, packerId: staffId, packerName: staffName });
    },
    [assignMutate],
  );

  /** The other under-title facts, written through the same waist. */
  const handleCommitSubtitleField = useCallback(
    (record: ShippedOrder, fieldId: string, value: string | null) => {
      const id = Number(record.id);
      if (!Number.isFinite(id)) return;
      if (fieldId === 'orders.notes') {
        const noteText = (value ?? '').trim();
        if (!noteText) return; // an append-only trail has no "clear"
        void fetch(`/api/orders/${id}/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ noteText }),
        })
          .then((res) => {
            if (!res.ok) throw new Error(`note ${res.status}`);
            refreshDomain('orders.outbound');
          })
          .catch((e) => toast.error(e instanceof Error ? e.message : 'Failed to save the note'));
        return;
      }
      const patch =
        fieldId === 'orders.qty'
          ? { orderId: id, quantity: value }
          : fieldId === 'orders.item_number'
            ? { orderId: id, itemNumber: value }
            : null;
      if (!patch) return;
      assignMutate(patch);
    },
    [assignMutate],
  );

  /** Platform correction: */
  const handleCommitPlatform = useCallback((record: ShippedOrder, accountSource: string) => {
    const id = Number(record.id);
    const next = accountSource.trim();
    if (!Number.isFinite(id) || !next) return;
    void fetch(`/api/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountSource: next }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`platform ${res.status}`);
        refreshDomain('orders.outbound');
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Failed to change the platform'));
  }, []);

  /** SKU home bin: */
  const handleCommitSkuBin = useCallback((record: ShippedOrder, locationBarcode: string) => {
    const sku = String(record.sku ?? '').trim();
    const location = locationBarcode.trim();
    if (!sku || !location) return;
    void fetch('/api/update-sku-location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku, location }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`location ${res.status}`);
        refreshDomain('orders.outbound');
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Failed to set the bin'));
  }, []);

  const handleCommitTracking = useCallback(
    (record: ShippedOrder, tracking: string) => {
      const id = Number(record.id);
      const next = tracking.trim();
      if (!Number.isFinite(id) || !next) return;
      assignMutate({ orderId: id, shippingTrackingNumber: next });
    },
    [assignMutate],
  );

  return useMemo(
    () => ({
      handleCommitCondition,
      handleCommitShipBy,
      handleCommitStageAssign,
      handleCommitSubtitleField,
      handleCommitPlatform,
      handleCommitSkuBin,
      handleCommitTracking,
    }),
    [
      handleCommitCondition,
      handleCommitShipBy,
      handleCommitStageAssign,
      handleCommitSubtitleField,
      handleCommitPlatform,
      handleCommitSkuBin,
      handleCommitTracking,
    ],
  );
}
