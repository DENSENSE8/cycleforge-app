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
  ordersIndexColumnsFor,
  type OrdersQueueColumn,
  type OrdersQueueColumnKey,
} from '@/lib/dashboard-order-row-layout';
import { useOrdersTableLayout } from './useOrdersTableLayout';
import { ORDERS_GRID_CAPABILITIES } from '@/components/dashboard/orders-queue/orders-queue-descriptor';
import { ORDERS_DEFAULT_TABLE_BINDING } from './orders-table-definition';
import {
  OrderRecordActionStrip,
  OrdersMorphingHost,
} from '@/components/outbound/orders/to-ship/MorphingRowActionMenu';
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
import {
  daysLateOn,
  queueRowStaff,
  useOrdersQueueFeed,
  type OrdersQueueCommits,
} from './useOrdersQueueFeed';

interface UseOrdersSpreadsheetOptions {
  records: ShippedOrder[];
  loading: boolean;
  searchValue: string;
  /** Who ANSWERED {@link searchValue} — see `DataTableSearch.answeredBy`. */
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
  /** Rail-selection model — **the check-set becomes the single selection SoT** and the open record is derived from it (1 selected ⇒ the… */
  railSelection?: boolean;
  /** Surface chrome (status dots, tracking/serial affordances). Default fulfillment. */
  queueMode?: OrdersQueueMode;
  /** Staff-prefs identity for per-staff column config (visible fields + drag order), i.e. */
  tableId?: TableId;
  /** Accessible name for the table — REQUIRED. */
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
  /** Paperwork walk on one order — the open record's strip offers it (To-ship Labels). */
  onOpenLabels?: (record: ShippedOrder) => void;
}

/**
 * The open record, for the desk that PLACES it (`DeskRecordPlane` around the
 * table, owner 2026-09-26). Not a `DataTable` prop — take it off the bag
 * before spreading the rest onto the table.
 */
export interface OrdersSpreadsheetRecordPlane {
  /** The LIVE row of the open record (optimistic edits land there), or null. */
  record: ShippedOrder | null;
  /** Close the record (✕, Esc) — the plane's own close, which also tells the surface. */
  close: () => void;
  /** The rows in display order — the record's group siblings live here. */
  records: ShippedOrder[];
  todayKey: string;
  getStaffName: (id: number) => string;
  commits: OrdersQueueCommits;
}

/** The FEED half of a {@link DataTable} mount: */
type OrdersSpreadsheetFeed = Omit<
  DataTableProps<ShippedOrder, OrdersQueueColumnKey, OrdersQueueColumn>,
  'search' | 'filter' | 'tabs' | 'activeTab' | 'onTabChange' | 'totalCount'
> & { recordPlane: OrdersSpreadsheetRecordPlane };

/** **Outbound orders spreadsheet** — the family glue that resolves a {@link DataTable} feed bag for every outbound lane. */
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
  onOpenLabels,
}: UseOrdersSpreadsheetOptions): OrdersSpreadsheetFeed {
  const { isMobile } = useUIModeOptional();

  // ONE Orders binding (Wave-1 hand-model kill). `?ustatus=TESTED` narrows
  // ROWS (`UnshippedTable`'s lane predicate) — it never swaps column models;
  // "show who + when for pick" is the `orders.picked` slot binding.
  const binding = ORDERS_DEFAULT_TABLE_BINDING;

  // Effective slot layout (staff ?? org ?? product) → the mounted INDEX model:
  // one line per order (owner 2026-09-26). Rebinding changes bindings, never
  // keys, so slot-keyed prefs hold. The industrial line ledger is the floor.
  const { effectiveLayout, subtitleFieldIds, fields } = useOrdersTableLayout();
  const indexColumns = useMemo(
    () => ordersIndexColumnsFor(effectiveLayout),
    [effectiveLayout],
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
      closeRecord,
    },
    handleCommitCondition,
    handleCommitShipBy,
    handleCommitStageAssign,
    handleCommitSubtitleField,
    handleCommitPlatform,
    handleCommitSkuBin,
    handleCommitTracking,
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

  // ── The open record, placed by the desk (`DeskRecordPlane`) ───────────────
  // The record reads the LIVE row (optimistic edits land there), not the
  // snapshot the selection plane captured when the row was opened.
  const openId = selectedRecord ? Number(selectedRecord.id) : null;
  const openRecord = useMemo(
    () =>
      openId == null
        ? null
        : (displayedRecords.find((r) => Number(r.id) === openId) ?? selectedRecord),
    [openId, displayedRecords, selectedRecord],
  );
  const commits = useMemo<OrdersQueueCommits>(
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
  const recordPlane = useMemo<OrdersSpreadsheetRecordPlane>(
    () => ({ record: openRecord, close: closeRecord, records: displayedRecords, todayKey, getStaffName, commits }),
    [openRecord, closeRecord, displayedRecords, todayKey, getStaffName, commits],
  );
  const stripMode = queueMode === 'shipped' ? 'shipped' : 'to-ship';

  const shellRef = useRef<HTMLDivElement>(null);

  /** Header grip → a persisted per-track width. */
  const handleResizeColumn = useCallback((key: string, widthPx: number) => {
    document.documentElement.style.setProperty(`--cf-col-${key.replace(/[^A-Za-z0-9_-]/g, '-')}`, `${widthPx}px`);
  }, []);

  const handleSortChange = useCallback(
    (key: OrdersQueueColumnKey, nextDir: 'asc' | 'desc') => {
      // Resolve through the compound map: the header's key is a TRACK
      // (`fulfillment`, `item`, `status:1`), and the `?sort=` vocabulary is in
      // FACTS (`order`, `title`, `picked`). Slot tracks resolve via fieldId.
      const col = indexColumns.find((c) => c.key === key);
      const resolved = queueSortForColumnKey(key, col?.fieldId);
      if (!resolved) return;
      setSort(resolved, nextDir);
    },
    [setSort, indexColumns],
  );

  const isSearching = Boolean(searchValue.trim());
  const showFirstRun =
    Boolean(firstRunEmpty) && !loading && !isSearching && records.length === 0;

  /* The header's ACTIVE key, mapped back from the `?sort=` fact. */
  const sortedTrack =
    indexColumns.find((c) => queueSortForColumnKey(c.key, c.fieldId) === sort)?.key ??
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
          pickerId={staff.pickerId}
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
    // INDEX (one line per order) layout — MATERIALIZED from the effective slot layout, never a hand array.
    columns: indexColumns,
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
    sort: columnSort && isQueueSortableColumnKey(columnSort, indexColumns.find((c) => c.key === columnSort)?.fieldId)
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
    recordPlane,
    actionStrip: (
      <OrdersMorphingHost
        placement="action-row"
        records={displayedRecords}
        selectedIds={selectedIds}
        mode={stripMode}
        openRecordStrip={
          openRecord ? (
            <OrderRecordActionStrip
              key={openRecord.id}
              record={openRecord}
              mode={stripMode}
              checked={selectedIds.has(Number(openRecord.id))}
              onToggleSelect={handleToggleSelect}
              onOpenLabels={onOpenLabels}
            />
          ) : null
        }
      />
    ),
    // The check-set's verbs ride the header, which becomes the bulk bar.
    bulkBar: (
      <OrdersMorphingHost
        placement="header"
        records={displayedRecords}
        selectedIds={selectedIds}
        mode={stripMode}
      />
    ),
    // A header key on the compound row is a TRACK; the sort vocabulary is in
    // FACTS. `queueSortForColumnKey` bridges them, and this predicate is what
    // keeps the header offering the sorts the engine will actually perform.
    isSortable: (key) => {
      const col = indexColumns.find((c) => c.key === key);
      return isQueueSortableColumnKey(key, col?.fieldId);
    },
    selectGutterChrome: 'hover' as const,
    // `rowIndex` is the group's first-leaf ARIA index and MUST be forwarded:
    renderGroup: (group, baseStripeIndex, { columns: visible }, rowIndex) => (
      <QueueGroupRow
        group={group}
        baseStripeIndex={baseStripeIndex}
        rowIndex={rowIndex}
        columns={visible}
        selectedIds={selectedIds}
        queueMode={queueMode}
        onToggleGroup={handleToggleGroup}
        onRowClick={handleRowAction}
        renderRow={(record, stripeIndex, leafRowIndex, quietIdentity) =>
          renderLeaf(record, stripeIndex, visible, leafRowIndex, quietIdentity)
        }
      />
    ),
    renderRow: (record, stripeIndex, { columns: visible }, rowIndex) =>
      renderLeaf(record, stripeIndex, visible, rowIndex),
  };
}
