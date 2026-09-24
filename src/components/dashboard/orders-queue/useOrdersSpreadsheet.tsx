'use client';

import { useCallback, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { useUIModeOptional } from '@/design-system/providers/UIModeProvider';
import { OrderSearchEmptyState } from '@/components/dashboard/OrderSearchEmptyState';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { slotTableFindHighlightId } from '@/lib/tables/slot-table-find';
import {
  ORDER_EXPORT_COLUMNS,
  buildOrderExportRow,
} from '@/lib/dashboard/order-export-csv';
import type { DataTableProps } from '@/components/tables/DataTable';
import type { TableId } from '@/lib/tables/table-columns';
import {
  ordersCompoundColumnsFor,
  type OrdersQueueColumn,
  type OrdersQueueColumnKey,
} from '@/lib/dashboard-order-row-layout';
import { useOrdersTableLayout } from './useOrdersTableLayout';
import { ORDERS_GRID_CAPABILITIES } from '@/components/dashboard/orders-queue/orders-queue-descriptor';
import { ORDERS_DEFAULT_TABLE_BINDING } from './orders-table-definition';
import { OrdersMorphingHost } from '@/components/outbound/orders/to-ship/MorphingRowActionMenu';
import {
  COMPOUND_TRACK_SORT_KEYS,
  isQueueColumnSort,
  isQueueNamePinSort,
  isQueueSortableColumnKey,
  queueSortForColumnKey,
} from '@/utils/queue-display-sort';
import {
  resolveRowStatus,
  type OrdersQueueMode,
  type QueueRowRecord,
} from './helpers';
import { OrdersQueueTableRow } from './OrdersQueueTableRow';
import { QueueGroupRow } from './QueueGroupRow';
import { kitFaceForCatalogId } from '@/hooks/useKitCompositionMap';
import { AddTrackingPopover } from '@/components/outbound/labels/AddTrackingPopover';
import { daysLateOn, queueRowStaff, useOrdersQueueFeed } from './useOrdersQueueFeed';

export interface UseOrdersSpreadsheetOptions {
  records: ShippedOrder[];
  loading: boolean;
  searchValue: string;
  /**
   * Who ANSWERED {@link searchValue} — see `DataTableSearch.answeredBy`.
   *
   * `'client'` (default) keeps `filterShippedOrdersByQuery` as the narrowing
   * pass: the caller handed over every order it will ever show.
   *
   * `'server'` says `records` ARE the matches. To-ship fetches a BOUNDED page
   * (`limit: 200`, grown by "load more"), so filtering that page in memory
   * answered "no orders found" for an order sitting on page 3 — the desk
   * asserting an absence it could not see. `/api/orders?q=` already searches
   * the whole in-warehouse scope unbounded
   * (`dashboard-table-data.ts` drops the page bound when `q` is present), so
   * the second pass here would only be able to NARROW the server's answer by
   * rules that read fewer facts.
   *
   * Everything else `searchValue` feeds is unchanged and still correct: the
   * match highlight, the "N results" copy and the typed no-matches state all
   * describe the query the operator typed, whoever ran it.
   */
  searchAnsweredBy?: 'client' | 'server';
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
  /** Shortage / blocked-queue paint. Optional — ignored when unset. */
  shortageDesk?: boolean;
  onOpenLabels?: (record: ShippedOrder) => void;
}

/**
 * The FEED half of a {@link DataTable} mount: everything a lane resolves from
 * its records, with the chrome half (search · filter · tabs · counts · copy)
 * left to the page, which is the only place that knows the URL those controls
 * write to.
 */
export type OrdersSpreadsheetFeed = Omit<
  DataTableProps<ShippedOrder, OrdersQueueColumnKey, OrdersQueueColumn>,
  'search' | 'filter' | 'tabs' | 'activeTab' | 'onTabChange' | 'totalCount'
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
  searchAnsweredBy = 'client',
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
  ariaLabel,
  className,
  'data-testid': dataTestId = 'orders-grid-body',
  scrollParentRef,
  activeWorkRowId = null,
  renderActiveWorkBand,
}: UseOrdersSpreadsheetOptions): OrdersSpreadsheetFeed {
  const { isMobile } = useUIModeOptional();

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

  // The feed — rows, grouping, URL sort, selection plane, inline-edit commits,
  // sort menu and views. Shared with the To-ship ledger (`useOrdersQueueFeed`).
  const {
    todayKey,
    getStaffName,
    sort,
    dir,
    setSort,
    recentImportedOrders,
    painted,
    orderGroupsByDate,
    displayedRecords,
    compositionMap,
    plane: {
      selectedIds,
      selectedRecord,
      clickSelect,
      fillsById,
      handleRowAction,
      handleRowOpen,
      handleToggleSelect,
      handleToggleGroup,
      handleRequestReplaceTracking,
    },
    handleCommitCondition,
    handleCommitShipBy,
    handleCommitStageAssign,
    handleCommitSubtitleField,
    sortMenu,
    views,
  } = useOrdersQueueFeed({
    records,
    searchValue,
    searchAnsweredBy,
    onOpenRecord,
    onCloseRecord,
    selectionScope,
    railSelection,
    queueMode,
    tableId,
    surfaceId: dataTestId,
  });

  const getTableRowId = useCallback((r: ShippedOrder) => String(r.id), []);

  const shellRef = useRef<HTMLDivElement>(null);

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
      // Resolve through the compound map: the header's key is a TRACK
      // (`fulfillment`, `item`, `status:1`), and the `?sort=` vocabulary is in
      // FACTS (`order`, `title`, `picked`). Slot tracks resolve via fieldId.
      const col = compoundColumns.find((c) => c.key === key);
      const resolved = queueSortForColumnKey(key, col?.fieldId);
      if (!resolved) return;
      setSort(resolved, nextDir);
    },
    [setSort, compoundColumns],
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
    isQueueColumnSort(sort) && !isQueueNamePinSort(sort)
      ? ((sortedTrack ?? sort) as OrdersQueueColumnKey)
      : null;
  const columnSortDir = columnSort ? dir : null;

  const renderLeaf = useCallback(
    (
      record: ShippedOrder,
      stripeIndex: number,
      visible: readonly OrdersQueueColumn[],
      rowIndex?: number,
      quietIdentity = false,
    ) => {
      const r = record as QueueRowRecord;
      const recentImportLabel = recentImportedOrders.get(Number(record.id));
      const staff = queueRowStaff(r, getStaffName);
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
          selectGutterChrome="hover"
          rowFillHex={rowFillHex}
          rowIndex={rowIndex}
          onToggleSelect={handleToggleSelect}
          record={recentImportLabel ? { ...r, recent_import_label: recentImportLabel } : r}
          isSelected={selectedRecord?.id === record.id || selectedIds.has(Number(record.id))}
          selectMode={selectMode}
          isChecked={selectedIds.has(Number(record.id))}
          quietIdentity={quietIdentity}
          kitFace={kitFaceForCatalogId(compositionMap, r.sku_catalog_id)}
          isMobile={isMobile}
          useAlternateStripe={stripeIndex % 2 === 1}
          testerDisplay={staff.testerDisplay}
          packerDisplay={staff.packerDisplay}
          testerId={staff.testerId}
          packerId={staff.packerId}
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
      compositionMap,
      recentImportedOrders,
    ],
  );
  const findScrollToKey = selectedRecord
    ? String(selectedRecord.id)
    : slotTableFindHighlightId({
        query: searchValue,
        paintedRowIds: painted.map((row) => String(row.id)),
      });


  return {
    binding,
    copyExport: {
      columns: [...ORDER_EXPORT_COLUMNS],
      toRow: (row: ShippedOrder) => buildOrderExportRow(row),
    },
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
    rows: displayedRecords,
    getRowId: getTableRowId,
    scrollToKey: findScrollToKey,
    sort: columnSort && isQueueSortableColumnKey(columnSort, compoundColumns.find((c) => c.key === columnSort)?.fieldId)
      ? columnSort
      : null,
    dir: columnSortDir,
    onSortChange: handleSortChange,
    sortMenu,
    // The lane's saved views — resolved once in `useOrdersQueueFeed`.
    views,
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
    bodyPrefix: <OrdersMorphingHost records={displayedRecords} selectedIds={selectedIds} />,
    // A header key on the compound row is a TRACK; the sort vocabulary is in
    // FACTS. `queueSortForColumnKey` bridges them, and this predicate is what
    // keeps the header offering the sorts the engine will actually perform.
    isSortable: (key) => {
      const col = compoundColumns.find((c) => c.key === key);
      return isQueueSortableColumnKey(key, col?.fieldId);
    },
    selectGutterChrome: 'hover' as const,
    // `rowIndex` is the group's first-leaf ARIA index and MUST be forwarded:
    // `OrdersQueueTableRow` derives `inTable` from it, so without it every
    // grouped row claims `role="checkbox"` instead of `role="row"` and the
    // grid announces as a table with no rows.
    renderGroup: (group, baseStripeIndex, { columns: visible }, rowIndex) => (
      <QueueGroupRow
        group={group}
        baseStripeIndex={baseStripeIndex}
        rowIndex={rowIndex}
        columns={visible}
        selectedIds={selectedIds}
        queueMode={queueMode}
        onToggleGroup={handleToggleGroup}
        renderRow={(record, stripeIndex, leafRowIndex, quietIdentity) =>
          renderLeaf(record, stripeIndex, visible, leafRowIndex, quietIdentity)
        }
      />
    ),
    renderRow: (record, stripeIndex, { columns: visible }, rowIndex) =>
      renderLeaf(record, stripeIndex, visible, rowIndex),
  };
}
