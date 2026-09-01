'use client';

import { useCallback, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { getCurrentPSTDateKey, getDaysLateNullable } from '@/utils/date';
import { useStaffNameMap } from '@/hooks/useStaffNameMap';
import { useUIModeOptional } from '@/design-system/providers/UIModeProvider';
import { OrderSearchEmptyState } from '@/components/dashboard/OrderSearchEmptyState';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import type { DataTableProps } from '@/components/tables/DataTable';
import type { TableId } from '@/lib/tables/table-columns';
import { useQueueDisplaySort } from '@/hooks/useQueueDisplaySort';
import {
  ordersCompoundColumnsFor,
  type OrdersQueueColumn,
  type OrdersQueueColumnKey,
} from '@/lib/dashboard-order-row-layout';
import { useOrdersTableLayout } from './useOrdersTableLayout';
import { ORDERS_GRID_CAPABILITIES } from '@/components/dashboard/orders-queue/orders-queue-descriptor';
import { ORDERS_DEFAULT_TABLE_BINDING } from './orders-table-definition';
import { outboundSavedViewsConfig } from '@/components/unshipped/outbound-sidebar-shared';
import {
  COMPOUND_TRACK_SORT_KEYS,
  QUEUE_DISPLAY_SORT_OPTIONS,
  flipQueueDisplaySortDir,
  isQueueColumnSort,
  isQueueNamePinSort,
  isQueueSortableColumnKey,
  queueCarrierSortOptions,
  queueChannelSortOptions,
  queueDisplaySortFace,
  queueSortForColumnKey,
  type QueueDisplaySort,
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
import {
  ADDED_TODAY_BAND,
  ADDED_TODAY_LABEL,
  useOrdersQueueRows,
} from './useOrdersQueueRows';
import { useOrdersQueuePlane } from './useOrdersQueuePlane';
import { AddTrackingPopover } from '@/components/outbound/labels/AddTrackingPopover';
import { useOrderAssignment } from '@/hooks/useOrderAssignment';
import { refreshDomain } from '@/lib/refresh/bus';
import { toast } from '@/lib/toast';

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
   * When on, the left gutter checkbox owns the bulk set. Row click opens the
   * record. Sheets click-select (row body toggles membership) is off.
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
   * Labels, Staged, Review, and Shipped all render the SAME column SoT (the
   * compound slot materialization) and already shared one persisted column
   * ORDER under `'orders'`. Splitting visibility per lane
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
  /**
   * Label-run active row (R-FLOW-6 host b): the row id carrying the
   * active-work highlight while the To-ship Labels band is open. Highlight is
   * an OUTLINE (law M3) — colour only, no geometry, no tween.
   */
  activeWorkRowId?: string | null;
  /**
   * The expansion band rendered BENEATH the active-work row (the shared
   * `OrderShippingPanel` via `LabelRunBand`). Appears/disappears instantly —
   * the band host must not animate geometry (M1/M2/M5).
   */
  renderActiveWorkBand?: (record: ShippedOrder) => ReactNode;
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
 * {@link DataTable} feed bag for every outbound lane. Spread it onto the
 * host; there is no second table component.
 *
 * ```tsx
 * const sheet = useOrdersSpreadsheet({ ... });
 * return <DataTable {...sheet} search={search} tabs={tabs} />;
 * ```
 *
 * Plan: `docs/todo/one-table-engine-orders-host-PLAN.md` §4.2 — the shape
 * Incoming (`ReceivingLinesTable`) already mounts without a family GridHost.
 *
 * Shared by Pending, Packed, Labels, Staged, Review, and Shipped — ONE
 * binding ({@link ORDERS_DEFAULT_TABLE_BINDING}); the selection / cursor /
 * inspector plane lives in {@link useOrdersQueuePlane} (it encodes documented
 * race bug-fixes). This hook keeps only what family glue owns: the feed, URL
 * sort, and the row / header renderers.
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
  activeWorkRowId = null,
  renderActiveWorkBand,
}: UseOrdersSpreadsheetOptions): OrdersSpreadsheetFeed {
  // Resolved ONCE per table render and threaded into every row's lateness
  // lookup — see `daysLateOn`. Reading it per row is what made the civil-date
  // formatter a per-row cost.
  const todayKey = getCurrentPSTDateKey();
  const { isMobile } = useUIModeOptional();
  const { getStaffName } = useStaffNameMap();
  const { sort: urlSort, dir: urlDir, setSort } = useQueueDisplaySort();
  // Parent-supplied sort (Labels / Packed) owns row order — no URL column sort.
  const urlDriven = sortProp === undefined;
  const sort = sortProp ?? urlSort;
  const dir: QueueDisplaySortDir | null = urlDriven ? urlDir : null;

  // ONE Orders binding (Wave-1 hand-model kill). `?ustatus=TESTED` narrows
  // ROWS (`UnshippedTable`'s lane predicate) — it never swaps column models;
  // "show who + when for pick" is the `orders.picked` slot binding.
  const binding = ORDERS_DEFAULT_TABLE_BINDING;

  // Effective slot layout (staff ?? org ?? product) → the mounted compound
  // model. Rebinding changes bindings, never keys, so slot-keyed prefs hold.
  const { effectiveLayout, subtitleFieldIds, fields } = useOrdersTableLayout();
  const compoundColumns = useMemo(
    () => ordersCompoundColumnsFor(effectiveLayout, { queueMode }),
    [effectiveLayout, queueMode],
  );

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

  // ONE mutation hook for the whole table (not one per row): the compound
  // item cell's in-place condition edit commits through the same
  // `useOrderAssignment` waist the flat in-cell editors used — a scalar field
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

  /**
   * The other under-title facts, written through the same waist.
   *
   * Keyed by catalog field id so the handler does not have to learn a new name
   * every time an org binds a different fact under the title.
   *
   * `orders.notes` goes to the TRAIL, not through the assign waist. Notes are
   * append-only: `POST /api/orders/[id]/notes` adds an entry and (since
   * 2026-08-31) refreshes the denormalized `orders.notes` column the subtitle
   * paints, so the glyph shows what was just written instead of a stale scalar.
   * `/api/orders/assign` still has no `notes` branch, and must not grow one —
   * that would be a second independent author of the same field.
   */
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

  /**
   * Header grip → a persisted per-track width.
   *
   * The width lands as a `--cf-col-<key>` custom property, which is exactly what
   * `gridTemplate` already reads (`var(--cf-col-KEY, <rem floor>)`), so a drag
   * needs no new geometry path — it fills in the override the template has
   * always looked for. Scoped to the document so the header and every
   * virtualized row agree without threading state through the row window.
   */
  const handleResizeColumn = useCallback((key: string, widthPx: number) => {
    document.documentElement.style.setProperty(`--cf-col-${key.replace(/[^A-Za-z0-9_-]/g, '-')}`, `${widthPx}px`);
  }, []);

  const handleSortChange = useCallback(
    (key: OrdersQueueColumnKey, nextDir: 'asc' | 'desc') => {
      if (!urlDriven) return;
      // Resolve through the compound map: the header's key is a TRACK
      // (`fulfillment`, `item`, `status:1`), and the `?sort=` vocabulary is in
      // FACTS (`order`, `title`, `picked`). Slot tracks resolve via fieldId.
      const col = compoundColumns.find((c) => c.key === key);
      const resolved = queueSortForColumnKey(key, col?.fieldId);
      if (!resolved) return;
      setSort(resolved, nextDir);
    },
    [urlDriven, setSort, compoundColumns],
  );

  const handleSortMenuSelect = useCallback(
    (id: string) => {
      if (!urlDriven) return;
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
    [urlDriven, sort, dir, setSort],
  );

  const sortMenuOptions = useMemo(
    () => [...QUEUE_DISPLAY_SORT_OPTIONS, ...queueChannelSortOptions(), ...queueCarrierSortOptions()],
    [],
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
  const sortedTrack =
    compoundColumns.find((c) => queueSortForColumnKey(c.key, c.fieldId) === sort)?.key ??
    Object.entries(COMPOUND_TRACK_SORT_KEYS).find(([, fact]) => fact === sort)?.[0];
  const columnSort =
    urlDriven && isQueueColumnSort(sort) && !isQueueNamePinSort(sort)
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
        String(r.tested_by_name ?? '').trim() ||
        String(r.tester_name ?? '').trim() ||
        (Number(r.tested_by) > 0 ? getStaffName(Number(r.tested_by)) : '') ||
        (Number(r.tester_id) > 0 ? getStaffName(Number(r.tester_id)) : '');
      const packerName =
        String(r.packed_by_name ?? '').trim() ||
        String(r.packer_name ?? '').trim() ||
        (Number(r.packed_by) > 0 ? getStaffName(Number(r.packed_by)) : '') ||
        (Number(r.packer_id) > 0 ? getStaffName(Number(r.packer_id)) : '');
      const rowFillHex =
        clickSelect ? (fillsById[String(record.id)] ?? null) : null;
      return (
        <OrdersQueueTableRow
          key={record.id}
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
          testerId={
            Number(r.tester_id) > 0
              ? Number(r.tester_id)
              : Number(r.tested_by) > 0
                ? Number(r.tested_by)
                : null
          }
          packerId={
            Number(r.packer_id) > 0
              ? Number(r.packer_id)
              : Number(r.packed_by) > 0
                ? Number(r.packed_by)
                : null
          }
          rowStatus={resolveRowStatus(r, queueMode)}
          daysLate={daysLateOn(
            todayKey,
            (r.deadline_at as string | null | undefined) ||
              (r.ship_by_date as string | null | undefined),
          )}
          queueMode={queueMode}
          columns={visible}
          subtitleFieldIds={subtitleFieldIds}
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
          onCommitCondition={handleCommitCondition}
          onCommitSubtitleField={handleCommitSubtitleField}
          onCommitShipBy={handleCommitShipBy}
          onCommitStageAssign={handleCommitStageAssign}
        />
      );
    },
    [
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
      handleCommitCondition,
      handleCommitSubtitleField,
      handleCommitShipBy,
      handleCommitStageAssign,
      queueMode,
      clickSelect,
      fillsById,
      subtitleFieldIds,
    ],
  );

  return {
    binding,
    // COMPOUND (two-row) layout — the one row shape across every table,
    // MATERIALIZED from the effective slot layout (staff ?? org ?? product).
    // Passed as the host's column override rather than swapped into the
    // binding so the definition (prefs bucket, testid, shell recipe) is
    // untouched; only the presentation model moves.
    columns: compoundColumns,
    // Fields picker data — DataTable renders it when the definition declares
    // `fieldsMenu` (org/staff slot binding lives behind it). Header and
    // under-title drags both write through `fields.onReorderByDrop`.
    fields,
    onResizeColumn: handleResizeColumn,
    ariaLabel,
    orderGroupsByDate,
    /**
     * The ONE named band on this table. Day banding stays off — absolute civil
     * date is a per-row column here — but the day's intake gets an outlined,
     * sticky-captioned section at the top of the queue so "what came in today"
     * is answered without a filter, a second tab, or a strip above the rows
     * (the last of which the operator ruled out on 2026-08-31).
     */
    sectionHeaders: { [ADDED_TODAY_BAND]: ADDED_TODAY_LABEL },
    rows: displayedRecords,
    getRowId: getTableRowId,
    sort: columnSort && isQueueSortableColumnKey(columnSort, compoundColumns.find((c) => c.key === columnSort)?.fieldId)
      ? columnSort
      : null,
    dir: columnSortDir,
    onSortChange: handleSortChange,
    sortMenu: urlDriven
      ? {
          options: sortMenuOptions,
          active: sort,
          hot: sort !== 'deadline',
          onSelect: handleSortMenuSelect,
          activeFace: queueDisplaySortFace(sort),
        }
      : undefined,
    views:
      queueMode === 'fulfillment'
        ? {
            ...outboundSavedViewsConfig('unshipped'),
            emptyHint: 'Save a filter and sort combination to come back to it.',
          }
        : undefined,
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
    isSortable: (key) => {
      const col = compoundColumns.find((c) => c.key === key);
      return isQueueSortableColumnKey(key, col?.fieldId);
    },
    selectGutterChrome: 'always' as const,
    // `rowIndex` is the group's first-leaf ARIA index and MUST be forwarded:
    // `OrdersQueueTableRow` derives `inTable` from it, so without it every
    // grouped row claims `role="checkbox"` instead of `role="row"` and the
    // grid announces as a table with no rows.
    renderGroup: (group, baseStripeIndex, { columns: visible }, rowIndex) => (
      <QueueGroupRow
        group={group}
        baseStripeIndex={baseStripeIndex}
        rowIndex={rowIndex}
        renderRow={(record, stripeIndex, leafRowIndex) =>
          renderLeaf(record, stripeIndex, visible, leafRowIndex)
        }
      />
    ),
    renderRow: (record, stripeIndex, { columns: visible }, rowIndex) =>
      renderLeaf(record, stripeIndex, visible, rowIndex),
  };
}
