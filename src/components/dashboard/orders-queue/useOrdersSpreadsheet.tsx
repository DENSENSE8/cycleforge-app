'use client';

import { useCallback, useRef, type ReactNode, type RefObject } from 'react';
import { useSearchParams } from 'next/navigation';
import { getCurrentPSTDateKey, getDaysLateNullable } from '@/utils/date';
import { useStaffNameMap } from '@/hooks/useStaffNameMap';
import { useUIModeOptional } from '@/design-system/providers/UIModeProvider';
import { OrderSearchEmptyState } from '@/components/dashboard/OrderSearchEmptyState';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import type { DataTableProps } from '@/components/tables/DataTable';
import type { TableId } from '@/lib/tables/table-columns';
import { useQueueDisplaySort } from '@/hooks/useQueueDisplaySort';
import { useToShipStatusFilter } from '@/components/unshipped/useToShipStatusFilter';
import { getDashboardOrderViewFromSearch } from '@/utils/dashboard-search-state';
import {
  ORDERS_COMPOUND_COLUMNS,
  type OrdersQueueColumn,
  type OrdersQueueColumnKey,
  type OrdersQueueColumnMode,
} from '@/lib/dashboard-order-row-layout';
import { ORDERS_GRID_CAPABILITIES } from '@/components/dashboard/orders-queue/orders-queue-descriptor';
import { ordersTableBindingFor } from './orders-table-definition';
import {
  COMPOUND_TRACK_SORT_KEYS,
  isQueueColumnSort,
  isQueueSortableColumnKey,
  queueSortForColumnKey,
  type QueueDisplaySortDir,
} from '@/utils/queue-display-sort';
import {
  normalizePersonName,
  resolveRowStatus,
  type OrdersQueueMode,
  type OrdersQueueSort,
  type QueueRowRecord,
} from './helpers';
import { OrdersQueueTableRow } from './OrdersQueueTableRow';
import { QueueGroupRow } from './QueueGroupRow';
import { useOrdersQueueRows } from './useOrdersQueueRows';
import { useOrdersQueuePlane } from './useOrdersQueuePlane';
import { AddTrackingPopover } from '@/components/outbound/labels/AddTrackingPopover';
import { useGridColumnDisplay } from '@/design-system/components/grid/useGridColumnDisplay';

/**
 * `getDaysLateNullable`, memoized on `(today, deadline)`.
 *
 * The row list called it once per ROW per render, and each call builds TWO
 * `Intl.DateTimeFormat` instances — one to fold the deadline into a PST civil
 * date, one for today's. A 62-row To-ship window therefore constructed ~124
 * formatters on every render of the table, for a value that is a pure function
 * of a string and the civil date.
 *
 * `todayKey` is part of the key rather than captured, so the answer self-heals
 * across a PST midnight instead of pinning a desk left open overnight to
 * yesterday's lateness. The underlying resolver is untouched — this is a cache
 * in front of the date SoT, never a second implementation of the arithmetic.
 */
const DAYS_LATE_CACHE = new Map<string, number | null>();

function daysLateOn(todayKey: string, deadlineAt: string | null | undefined): number | null {
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

export interface UseOrdersSpreadsheetOptions {
  records: ShippedOrder[];
  loading: boolean;
  searchValue: string;
  onOpenRecord: (record: ShippedOrder) => void;
  onCloseRecord?: (record: ShippedOrder | null) => void;
  onClearSearch: () => void;
  emptyMessage?: string;
  /** Typed empty when zero rows and no search — replaces the faint emptyMessage. */
  firstRunEmpty?: ReactNode;
  searchEmptyTitle?: string;
  searchResultLabel?: string;
  clearSearchLabel?: string;
  /** Pencil multi-select chrome on rows. Shares the page's selection scope + action bar. */
  selectMode?: boolean;
  selectionScope: string;
  /**
   * Rail-selection model — **the check-set becomes the single selection SoT**
   * and the open record is derived from it (1 selected ⇒ the inspector opens on
   * that row). Off by default: this grid has seven mount sites and only the
   * three dashboard outbound lanes opt in.
   *
   * When on, also enables Sheets click-select (`clickSelect`): row click
   * toggles bulk, double-click opens; the select track keeps the painted
   * `'always'` checkbox gutter (header select-all + every leftmost row cell).
   *
   * `selectionScope` cannot stand in for this. Six of the seven hosts pass
   * `DASHBOARD_ORDERS_SELECTION_SCOPE` — including Labels, Staged, and both
   * Review tables — so gating on the scope would silently change four surfaces
   * that still run the bottom capsule.
   *
   * Plan: `docs/todo/order-rail-selection-plane-PLAN.md` (D3).
   */
  railSelection?: boolean;
  /** Surface chrome (status dots, tracking/serial affordances). Default fulfillment. */
  queueMode?: OrdersQueueMode;
  /**
   * Staff-prefs identity for per-staff column config (visible fields + drag
   * order), i.e. `staff_preferences.tableColumns[tableId]`.
   *
   * Default `'orders'` for EVERY outbound lane — Pending, Tested, Packed,
   * Labels, Staged, Review, and Shipped all render the SAME column SoT
   * (`ORDERS_QUEUE_COLUMNS` / `ORDERS_QUEUE_TESTED_COLUMNS`) and already shared
   * one persisted column ORDER under `'orders'`. Splitting visibility per lane
   * while order stayed global is the surprising outcome (curate Fields on
   * Pending, drag a column on Shipped, and the two prefs disagree), so both now
   * resolve under this one id. A host that genuinely wants an independent
   * layout passes its own `tableId` and gets BOTH prefs scoped to it.
   */
  tableId?: TableId;
  /**
   * Sort for row order / Date-column banding keys. When omitted, reads `?sort=`
   * via {@link useQueueDisplaySort} (Pending / To Ship).
   */
  sort?: OrdersQueueSort;
  /**
   * Accessible name for the table — REQUIRED. `LedgerGrid` exposes
   * `role="table"`; one shared grid serves every outbound lane, so the lane must
   * name itself ("Packed orders", "Labels queue") or a screen reader announces
   * an anonymous table on all of them.
   */
  ariaLabel: string;
  /** Extra classes on the outer shell. */
  className?: string;
  /** Stable test id for the outer shell (default orders-grid-body). */
  'data-testid'?: string;
  /**
   * Page scroll ancestor (Pending under `DashboardScrollShell`). When set, the
   * grid grows with content and virtualizes against that port so KPI strips
   * scroll away and the column header sticks under pinned chrome.
   */
  scrollParentRef?: RefObject<HTMLElement | null>;
  /**
   * Inspector View topics controls portal — when set, ▦ portals there. To Ship
   * always uses portal-only mode (no card-corner hover fallback).
   */
}

/**
 * The FEED half of a {@link DataTable} mount: everything a lane resolves from
 * its records, with the chrome half (search · filter · tabs · counts · copy)
 * left to the page, which is the only place that knows the URL those controls
 * write to.
 */
export type OrdersSpreadsheetFeed = Omit<
  DataTableProps<ShippedOrder, OrdersQueueColumnKey, OrdersQueueColumn>,
  'search' | 'filter' | 'tabs' | 'activeTab' | 'onTabChange' | 'totalCount' | 'copyExport'
>;

/**
 * **Outbound orders spreadsheet** — the family glue that resolves a
 * `NonlinearTableHost` prop bag for every outbound lane. Spread it onto the
 * host; there is no second table component.
 *
 * ```tsx
 * const sheet = useOrdersSpreadsheet({ ... });
 * return <div className={WORKBENCH_SHEET_HOST}><NonlinearTableHost {...sheet} /></div>;
 * ```
 *
 * Plan: `docs/todo/one-table-engine-orders-host-PLAN.md` §4.2 — the shape
 * Incoming (`ReceivingLinesTable`) already mounts without a family GridHost.
 *
 * Shared by Pending, Packed, Labels, Staged, Review, and Shipped. Two column-mode
 * bindings (`fulfillment.default` / `.tested`) are picked by
 * {@link ordersTableBindingFor}; the selection / cursor / inspector plane lives
 * in {@link useOrdersQueuePlane} (it encodes documented race bug-fixes). This
 * hook keeps only what family glue owns: mode resolution, the feed, URL sort,
 * viewport force-hide geometry, and the row / header renderers. The allowlisted
 * `OrdersQueueColumnHeader` fork keeps drag-reorder UI; fat `OrdersQueueTableRow`
 * keeps triage + in-cell edit.
 */
export function useOrdersSpreadsheet({
  records,
  loading,
  searchValue,
  onOpenRecord,
  onCloseRecord,
  onClearSearch,
  emptyMessage = 'No orders to ship',
  firstRunEmpty,
  searchEmptyTitle = 'Order not found',
  searchResultLabel = 'orders to ship',
  clearSearchLabel = 'Show All Pending Orders',
  selectMode = false,
  selectionScope,
  railSelection = false,
  queueMode = 'fulfillment',
  tableId = 'orders',
  sort: sortProp,
  ariaLabel,
  className,
  'data-testid': dataTestId = 'orders-grid-body',
  scrollParentRef,
}: UseOrdersSpreadsheetOptions): OrdersSpreadsheetFeed {
  const { displayByKey: columnDisplay } = useGridColumnDisplay(tableId);
  // Resolved ONCE per table render and threaded into every row's lateness
  // lookup — see `daysLateOn`. Reading it per row is what made the civil-date
  // formatter a per-row cost.
  const todayKey = getCurrentPSTDateKey();
  const searchParams = useSearchParams();
  const { isMobile } = useUIModeOptional();
  const { getStaffName } = useStaffNameMap();
  const { sort: urlSort, dir: urlDir, setSort } = useQueueDisplaySort();
  // Parent-supplied sort (Labels / Packed) owns row order — no URL column sort.
  const urlDriven = sortProp === undefined;
  const sort = sortProp ?? urlSort;
  const dir: QueueDisplaySortDir | null = urlDriven ? urlDir : null;

  // Mode column set (plan Phase A): the Tested lifecycle tab (or legacy
  // `?ustatus=TESTED` on station embeds) swaps to tester + tested-at layout.
  const orderView = getDashboardOrderViewFromSearch(searchParams);
  const { active: ustatus } = useToShipStatusFilter();
  const columnMode: OrdersQueueColumnMode =
    queueMode === 'fulfillment' && (orderView === 'tested' || ustatus === 'TESTED')
      ? 'fulfillment.tested'
      : 'fulfillment.default';
  // Two column-mode bindings — the definition/host resolve columns + descriptor.
  const binding = ordersTableBindingFor(columnMode);

  const { orderGroupsByDate, displayedRecords } = useOrdersQueueRows({
    records,
    sort,
    dir,
    queueMode,
  });

  const getTableRowId = useCallback((r: ShippedOrder) => String(r.id), []);

  // Selection / cursor / inspector plane — the page concern (rail-selection SoT,
  // record cursor, external-open adoption, Labels replace-tracking). Lifted
  // verbatim into a shared hook so this file stays a presentational adapter.
  const {
    selectedIds,
    selectedRecord,
    clickSelect,
    fillsById,
    handleRowAction,
    handleRowOpen,
    handleToggleSelect,
    handleRequestReplaceTracking,
  } = useOrdersQueuePlane({
    displayedRecords,
    orderGroupsByDate,
    onOpenRecord,
    onCloseRecord,
    selectionScope,
    railSelection,
    surfaceId: dataTestId,
    tableId,
  });

  const shellRef = useRef<HTMLDivElement>(null);

  const handleSortChange = useCallback(
    (key: OrdersQueueColumnKey, nextDir: 'asc' | 'desc') => {
      if (!urlDriven) return;
      // Resolve through the compound map: the header's key is a TRACK
      // (`fulfillment`, `item`), and the `?sort=` vocabulary is in FACTS
      // (`order`, `title`). This used to be a bare `isQueueColumnSort(key)`,
      // which every compound key failed — so header clicks were a silent no-op.
      const resolved = queueSortForColumnKey(key);
      if (!resolved) return;
      setSort(resolved, nextDir);
    },
    [urlDriven, setSort],
  );

  const isSearching = Boolean(searchValue.trim());
  const showFirstRun =
    Boolean(firstRunEmpty) && !loading && !isSearching && records.length === 0;

  /*
    The header's ACTIVE key, mapped back from the `?sort=` fact.

    `?sort=order` has to light the `fulfillment` header, not a flat `order`
    header that no longer exists — otherwise a sorted column shows no
    `aria-sort` and the operator cannot see what the list is ordered by.
  */
  const sortedTrack = Object.entries(COMPOUND_TRACK_SORT_KEYS).find(
    ([, fact]) => fact === sort,
  )?.[0];
  const columnSort =
    urlDriven && isQueueColumnSort(sort)
      ? ((sortedTrack ?? sort) as OrdersQueueColumnKey)
      : null;
  const columnSortDir = urlDriven && columnSort ? dir : null;

  const renderLeaf = useCallback(
    (
      record: ShippedOrder,
      stripeIndex: number,
      visible: readonly OrdersQueueColumn[],
      rowIndex?: number,
    ) => {
      const r = record as QueueRowRecord;
      const testerName =
        (r.tested_by_name as string | undefined) ||
        (r.tester_name as string | undefined) ||
        getStaffName(r.tested_by as number | null | undefined) ||
        getStaffName(r.tester_id as number | null | undefined);
      const packerName =
        (r.packed_by_name as string | undefined) ||
        (r.packer_name as string | undefined) ||
        getStaffName(r.packed_by as number | null | undefined) ||
        getStaffName(r.packer_id as number | null | undefined);
      const rowFillHex =
        clickSelect ? (fillsById[String(record.id)] ?? null) : null;
      return (
        <OrdersQueueTableRow
          key={record.id}
          // Per-staff column display, resolved ONCE in the host and threaded —
          // the same shape Receiving uses. Orders had no `columnDisplay` in
          // scope at all, so a staffer's muted/emphasis/warning column was
          // honoured on Unbox History and silently dropped here.
          columnDisplay={columnDisplay}
          disableEnterAnimation
          disableLayoutAnimation
          opaqueStripe
          gridSkin
          clickSelect={clickSelect}
          selectGutterChrome="always"
          rowFillHex={rowFillHex}
          rowIndex={rowIndex}
          onToggleSelect={handleToggleSelect}
          record={r}
          isSelected={selectedRecord?.id === record.id || selectedIds.has(Number(record.id))}
          selectMode={selectMode}
          isChecked={selectedIds.has(Number(record.id))}
          isMobile={isMobile}
          useAlternateStripe={stripeIndex % 2 === 1}
          testerDisplay={normalizePersonName(testerName)}
          packerDisplay={normalizePersonName(packerName)}
          testerId={(r.tested_by as number | null) ?? (r.tester_id as number | null)}
          packerId={(r.packed_by as number | null) ?? (r.packer_id as number | null)}
          rowStatus={resolveRowStatus(r, queueMode)}
          daysLate={daysLateOn(
            todayKey,
            (r.deadline_at as string | null | undefined) ||
              (r.ship_by_date as string | null | undefined),
          )}
          queueMode={queueMode}
          columns={visible}
          capabilities={ORDERS_GRID_CAPABILITIES}
          trackingAction={
            queueMode === 'labels' ? <AddTrackingPopover record={record} /> : undefined
          }
          onRowClick={handleRowAction}
          onRowOpen={clickSelect ? handleRowOpen : undefined}
          onRequestReplaceTracking={
            queueMode === 'fulfillment' || queueMode === 'labels'
              ? handleRequestReplaceTracking
              : undefined
          }
        />
      );
    },
    [
      // `columnDisplay` is READ in the body (threaded to every row) — omitting
      // it froze this closure on the prefs that happened to be resolved at
      // first render, so a staffer who changed a column's emphasis saw the
      // Fields menu update and the grid keep the old paint until something
      // unrelated (a selection, a sort) happened to rebuild the callback.
      columnDisplay,
      todayKey,
      getStaffName,
      selectMode,
      selectedIds,
      selectedRecord,
      isMobile,
      handleRowAction,
      handleRowOpen,
      handleToggleSelect,
      handleRequestReplaceTracking,
      queueMode,
      clickSelect,
      fillsById,
    ],
  );

  return {
    binding,
    // COMPOUND (two-row) layout — the one row shape across every table. Passed
    // as the host's column override rather than swapped into the binding so the
    // definition (prefs bucket, testid, shell recipe) is untouched; only the
    // presentation model moves.
    columns: ORDERS_COMPOUND_COLUMNS,
    ariaLabel,
    orderGroupsByDate,
    rows: displayedRecords,
    getRowId: getTableRowId,
    sort: columnSort && isQueueSortableColumnKey(columnSort) ? columnSort : null,
    dir: columnSortDir,
    onSortChange: handleSortChange,
    loading,
    emptyMessage,
    emptyState: showFirstRun ? firstRunEmpty : undefined,
    searchEmptyState: (
      <OrderSearchEmptyState
        query={searchValue}
        title={searchEmptyTitle}
        resultLabel={searchResultLabel}
        clearLabel={clearSearchLabel}
        onClear={onClearSearch}
      />
    ),
    shellRef,
    scrollParentRef,
    className,
    testId: dataTestId,
    selectionScope,
    // A header key on the compound row is a TRACK; the sort vocabulary is in
    // FACTS. `queueSortForColumnKey` bridges them, and this predicate is what
    // keeps the header offering the sorts the engine will actually perform.
    isSortable: isQueueSortableColumnKey,
    selectGutterChrome: 'always' as const,
    renderGroup: (group, baseStripeIndex, { columns: visible }) => (
      <QueueGroupRow
        group={group}
        baseStripeIndex={baseStripeIndex}
        renderRow={(record, stripeIndex, rowIndex) =>
          renderLeaf(record, stripeIndex, visible, rowIndex)
        }
      />
    ),
    renderRow: (record, stripeIndex, { columns: visible }, rowIndex) =>
      renderLeaf(record, stripeIndex, visible, rowIndex),
  };
}
