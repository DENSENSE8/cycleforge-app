'use client';

import { useCallback, useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { useSearchParams } from 'next/navigation';
import type { OnChangeFn, SortingState } from '@tanstack/react-table';
import { getDaysLateNullable } from '@/utils/date';
import { useStaffNameMap } from '@/hooks/useStaffNameMap';
import { useUIModeOptional } from '@/design-system/providers/UIModeProvider';
import { useTableSelectMode } from '@/hooks/useTableSelectMode';
import { useColumnOrder } from '@/components/ui/table-column-config/useColumnOrder';
import { OrderSearchEmptyState } from '@/components/dashboard/OrderSearchEmptyState';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { LedgerGrid, useGridColumnVisibility, useGridSurface } from '@/design-system/components/grid';
import type { TableId } from '@/lib/tables/table-columns';
import {
  TABLE_SURFACE_CLIP_CLASS,
} from '@/design-system/tokens/table-surface';
import { useQueueDisplaySort } from '@/hooks/useQueueDisplaySort';
import { useToShipStatusFilter } from '@/components/unshipped/useToShipStatusFilter';
import { getDashboardOrderViewFromSearch } from '@/utils/dashboard-search-state';
import {
  ordersQueueColumnsFor,
  ordersQueueContentMinWidthRem,
  sanitizeOrdersQueueColumnOrder,
  type OrdersQueueColumn,
  type OrdersQueueColumnKey,
  type OrdersQueueColumnMode,
} from '@/lib/dashboard-order-row-layout';
import { ORDERS_GRID_CAPABILITIES } from '@/components/dashboard/orders-queue/orders-queue-descriptor';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import {
  isQueueColumnSort,
  type QueueDisplaySortColumn,
  type QueueDisplaySortDir,
} from '@/utils/queue-display-sort';
import {
  normalizePersonName,
  resolveRowStatus,
  type OrdersQueueMode,
  type OrdersQueueSort,
  type QueueRowRecord,
} from './helpers';
import { ordersQueueColumnDefsFor } from './orders-queue-column-defs';
import { OrdersQueueTableRow } from './OrdersQueueTableRow';
import { OrdersQueueColumnHeader } from './OrdersQueueColumnHeader';
import { QueueGroupRow } from './QueueGroupRow';
import { useOrdersQueueRows } from './useOrdersQueueRows';
import { useOrdersQueueSelection } from './useOrdersQueueSelection';
import { AddTrackingPopover } from '@/components/outbound/labels/AddTrackingPopover';
import { useViewportForcedHidden } from './ViewportForcedHidden';
import { resolveRailOccupancy } from '@/lib/right-rail/selection-occupancy';

interface OrdersGridViewProps {
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
  /** Stable test id for the outer shell (default pending-grid-body). */
  'data-testid'?: string;
  /**
   * Page scroll ancestor (Pending under `DashboardScrollShell`). When set, the
   * grid grows with content and virtualizes against that port so KPI strips
   * scroll away and the column header sticks under pinned chrome.
   */
  scrollParentRef?: RefObject<HTMLElement | null>;
}

/**
 * **Outbound orders spreadsheet** — composed from {@link LedgerGrid}.
 *
 * Shared by Pending, Packed, Labels, Staged, Review, and Shipped. Frozen
 * identity pane (`select · Product`) is active: `scrollX` lets date…tracking
 * scroll under the pinned pane. Absolute Date is a per-row column — no
 * floating day bands.
 */
export function OrdersGridView({
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
}: OrdersGridViewProps) {
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
  const canonicalColumns = ordersQueueColumnsFor(columnMode);

  const { orderGroupsByDate, displayedRecords } = useOrdersQueueRows({
    records,
    sort,
    dir,
    queueMode,
  });

  const { selectedRecord, handleRowClick, openRecord, closeRecord } = useOrdersQueueSelection({
    visibleRecords: displayedRecords,
    displayedRecords,
    onOpenRecord,
    onCloseRecord,
  });

  const getRowId = useCallback((r: ShippedOrder) => Number(r.id), []);
  const getTableRowId = useCallback((r: ShippedOrder) => String(r.id), []);
  // Always-on left gutter (Airtable-style): checkboxes toggle the set; row-body
  // click opens the record. `selectMode` only gates visible pencil chrome.
  const { selectedIds, toggle, selectOnly, clear } = useTableSelectMode<ShippedOrder>({
    scope: selectionScope,
    selectMode: true,
    rows: displayedRecords,
    getId: getRowId,
  });
  const singleSelectedId = selectedIds.size === 1 ? [...selectedIds][0] : null;

  // ─── Rail selection: the check-set is the only selection ───────────────────
  // Set iteration is insertion order, so this preserves the order rows were
  // picked in — which is what the compare pane's left/right columns key off.
  const railOccupancy = useMemo(
    () => (railSelection ? resolveRailOccupancy([...selectedIds]) : null),
    [railSelection, selectedIds],
  );
  const selectedRecordId = selectedRecord ? Number(selectedRecord.id) : null;
  /**
   * The record the SET is currently responsible for — the one piece of state
   * that lets the two effects below tell three superficially identical
   * situations apart:
   *
   *   set {4821} · record null · ref 4821  → the operator CLOSED it → clear
   *   set {4821} · record null · ref null  → checked, rows not landed → wait
   *   set {}     · record 4821 · ref null  → an external open (deep link,
   *                                          search jump, Recents) → adopt it
   *
   * Without it the effects fight. Closing the inspector while its row stays
   * checked made the derived-open effect immediately re-open it (the panel could
   * not be closed at all), and a naive fix for that closed the deep-linked
   * record during the one commit before the set adopts it.
   */
  const railOpenedIdRef = useRef<number | null>(null);

  // Derive the open record from the set.
  useEffect(() => {
    if (!railOccupancy) return;
    if (railOccupancy.kind === 'inspect') {
      if (selectedRecordId === railOccupancy.orderId) return;
      if (selectedRecordId == null) {
        // Closed from the inspector itself (Escape, its X, close-shipped-details)
        // while the row stayed checked. Under this model an open record IS a
        // selection of one, so the close has to clear the set.
        if (railOpenedIdRef.current === railOccupancy.orderId) {
          railOpenedIdRef.current = null;
          clear();
          return;
        }
        // Never opened — fall through and open it below.
      }
      const next = displayedRecords.find((r) => Number(r.id) === railOccupancy.orderId);
      // Checked but not on screen — a deep link whose rows have not landed, or a
      // refetch in flight. Leave the current occupant alone: dropping it here is
      // exactly what used to make a reloaded row vanish, and genuine removal is
      // already owned by useOrdersQueueSelection's seen-in-this-queue guard.
      if (!next) return;
      railOpenedIdRef.current = railOccupancy.orderId;
      openRecord(next);
      return;
    }

    // 0, 2, or 3+ selected — the single-record inspector is not the right body.
    // (2 and 3+ get their own occupants in plan phases 3 and 4.)
    if (selectedRecordId == null) return;
    // Only close a record the SET opened. An externally-opened record sits here
    // for exactly one commit before the seed effect adopts it, and closing it in
    // that window is what broke `?openOrderId=` on reload.
    if (railOpenedIdRef.current !== selectedRecordId) return;
    railOpenedIdRef.current = null;
    closeRecord();
  }, [railOccupancy, selectedRecordId, displayedRecords, openRecord, closeRecord, clear]);

  // Adopt an externally-opened record into the set, so every entry path lands on
  // the same single selection SoT. Guarded by the ref, not by set size: an
  // external jump SHOULD replace a live multi-select, but a clear must not
  // resurrect the row it just closed.
  useEffect(() => {
    if (!railSelection || selectedRecordId == null) return;
    if (railOpenedIdRef.current === selectedRecordId) return;
    railOpenedIdRef.current = selectedRecordId;
    selectOnly(selectedRecordId);
  }, [railSelection, selectedRecordId, selectOnly]);

  const { order: persistedOrder, setOrder, resetOrder } = useColumnOrder(tableId);
  const sanitizedOrder = useMemo(
    () => sanitizeOrdersQueueColumnOrder(persistedOrder, canonicalColumns),
    [persistedOrder, canonicalColumns],
  );
  const shellRef = useRef<HTMLDivElement>(null);
  // Viewport priority collapse (By → Qty → Cond) — house logic, ephemeral and
  // never persisted to staff prefs.
  const forceHidden = useViewportForcedHidden(shellRef);
  // ONE visibility resolution (descriptor tier + this staffer's delta + the
  // viewport collapse above), mirrored into TanStack so the state engine stays
  // the record of which tracks render. `displayColumns` below reads back off
  // TanStack, so header / rows / group summaries / grid template all follow.
  const { columnVisibility } = useGridColumnVisibility<OrdersQueueColumn>({
    columns: canonicalColumns,
    tableId,
    forceHidden,
  });

  // URL `?sort=` stays the durable SoT; TanStack mirrors it as controlled state.
  const sortingState = useMemo<SortingState>(
    () =>
      urlDriven && isQueueColumnSort(sort) && dir
        ? [{ id: sort, desc: dir === 'desc' }]
        : [],
    [urlDriven, sort, dir],
  );
  const handleSortingChange = useCallback<OnChangeFn<SortingState>>(
    (updater) => {
      if (!urlDriven) return;
      const next = typeof updater === 'function' ? updater(sortingState) : updater;
      const first = next[0];
      if (first && isQueueColumnSort(first.id)) {
        setSort(first.id as QueueDisplaySortColumn, first.desc ? 'desc' : 'asc');
      }
    },
    [urlDriven, setSort, sortingState],
  );
  const handleColumnOrderChange = useCallback<OnChangeFn<string[]>>(
    (updater) => {
      const next = typeof updater === 'function' ? updater([...sanitizedOrder]) : updater;
      setOrder(sanitizeOrdersQueueColumnOrder(next, canonicalColumns));
    },
    [sanitizedOrder, setOrder, canonicalColumns],
  );

  // Headless state waist (TanStack v8): columns + sorting + visibility + order.
  // Markup, virtualization, folds, and mutations stay house (`"use no memo"`
  // lives on the hook — consumers read its returned arrays, never table getters).
  const { table, visibleLeafColumns } = useGridSurface<ShippedOrder>({
    data: displayedRecords,
    columns: ordersQueueColumnDefsFor(columnMode),
    getRowId: getTableRowId,
    sorting: sortingState,
    onSortingChange: handleSortingChange,
    columnVisibility,
    columnOrder: sanitizedOrder,
    onColumnOrderChange: handleColumnOrderChange,
  });

  // House geometry keeps reading the Kinetic Ledger column models — mapped off
  // the TanStack visible-leaf order. Content-keyed memo so row `columns` prop
  // identity is stable across unrelated re-renders (rows are memoized on it).
  const visibleKeySig = visibleLeafColumns.map((c) => c.id).join('\0');
  const displayColumns = useMemo(
    () => {
      const byKey = new Map(canonicalColumns.map((c) => [c.key, c]));
      return visibleKeySig
        .split('\0')
        .filter(Boolean)
        .map((key) => byKey.get(key as OrdersQueueColumnKey))
        .filter((c): c is OrdersQueueColumn => Boolean(c));
    },
    [visibleKeySig, canonicalColumns],
  );

  const handleSortColumn = useCallback(
    (key: OrdersQueueColumnKey) => {
      if (!urlDriven || !isQueueColumnSort(key)) return;
      // Route the click through the TanStack column (asc ↔ desc, desc-first on
      // Age) — `handleSortingChange` writes the result back to the URL SoT.
      table.getColumn(key)?.toggleSorting();
    },
    [table, urlDriven],
  );

  const isCustomOrder = useMemo(
    () => sanitizedOrder.some((key, i) => key !== canonicalColumns[i]?.key),
    [sanitizedOrder, canonicalColumns],
  );

  const handleReorderColumns = useCallback(
    (nextMovable: OrdersQueueColumnKey[]) => {
      table.setColumnOrder(sanitizeOrdersQueueColumnOrder(nextMovable, canonicalColumns));
    },
    [table, canonicalColumns],
  );

  const handleResetColumnOrder = useCallback(() => {
    resetOrder();
    toast.success('Column order reset');
  }, [resetOrder]);

  const handleRowAction = useCallback(
    (record: ShippedOrder, event?: { shiftKey: boolean }) => {
      if (!railSelection) {
        handleRowClick(record);
        return;
      }
      const id = Number(record.id);
      // Shift extends the set from the anchor — same gesture as the checkbox.
      if (event?.shiftKey) {
        toggle(id, true);
        return;
      }
      // Re-clicking the sole selected row clears it. This preserves the
      // click-again-to-close gesture the inspector had before the open channel
      // and the check-set merged; it now clears the selection too, because under
      // this model an open record IS a selection of one.
      if (selectedIds.size === 1 && selectedIds.has(id)) {
        clear();
        return;
      }
      selectOnly(id);
    },
    [railSelection, handleRowClick, toggle, selectedIds, clear, selectOnly],
  );

  const handleToggleSelect = useCallback(
    (record: ShippedOrder, event: { shiftKey: boolean }) => {
      toggle(Number(record.id), event.shiftKey);
    },
    [toggle],
  );

  const isSearching = Boolean(searchValue.trim());
  const showFirstRun =
    Boolean(firstRunEmpty) && !loading && !isSearching && records.length === 0;

  // Scroll-surface testid pairs with the shell's (`pending-grid-body` →
  // `pending-grid-scroll`) so specs can target either without new props.
  const scrollTestId = dataTestId.endsWith('-body')
    ? dataTestId.replace(/-body$/, '-scroll')
    : `${dataTestId}-scroll`;

  const renderRow = useCallback(
    (record: ShippedOrder, stripeIndex: number, rowIndex?: number) => {
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
      const hasOutOfStock = Boolean(r.is_out_of_stock);
      const notesValue = String(r.notes || '').trim();
      return (
        <OrdersQueueTableRow
          key={record.id}
          disableEnterAnimation
          disableLayoutAnimation
          opaqueStripe
          gridSkin
          rowIndex={rowIndex}
          onToggleSelect={handleToggleSelect}
          singleSelected={singleSelectedId === Number(record.id)}
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
          hasOutOfStock={hasOutOfStock}
          notesValue={notesValue}
          daysLate={getDaysLateNullable(r.deadline_at as string | null | undefined)}
          queueMode={queueMode}
          columns={displayColumns}
          capabilities={ORDERS_GRID_CAPABILITIES}
          trackingAction={
            queueMode === 'labels' ? <AddTrackingPopover record={record} /> : undefined
          }
          onRowClick={handleRowAction}
        />
      );
    },
    [
      getStaffName,
      selectMode,
      selectedIds,
      selectedRecord,
      isMobile,
      handleRowAction,
      handleToggleSelect,
      displayColumns,
      singleSelectedId,
      queueMode,
    ],
  );

  const renderGroup = useCallback(
    (
      group: Parameters<typeof QueueGroupRow>[0]['group'],
      baseStripeIndex: number,
      rowIndex?: number,
    ) => (
      <QueueGroupRow
        group={group}
        baseStripeIndex={baseStripeIndex}
        rowIndex={rowIndex}
        isMobile={isMobile}
        gridSkin
        columns={displayColumns}
        renderRow={renderRow}
      />
    ),
    [isMobile, renderRow, displayColumns],
  );

  return (
    <div
      ref={shellRef}
      data-testid={dataTestId}
      data-table-surface=""
      className={cn(
        // Framed ops table shell (SoT: table-surface) — always overflow-hidden
        // so airtable cell grid clips cleanly at rounded corners.
        'flex min-w-0 w-full flex-col',
        !scrollParentRef && 'h-full min-h-0 flex-1',
        TABLE_SURFACE_CLIP_CLASS,
        className,
      )}
    >
      <LedgerGrid<ShippedOrder>
        scrollX
        scrollParentRef={scrollParentRef}
        contentMinWidthRem={ordersQueueContentMinWidthRem(displayColumns)}
        gridSkin="airtable"
        aria-label={ariaLabel}
        data-testid={scrollTestId}
        orderGroupsByDate={orderGroupsByDate}
        isSearching={isSearching}
        columnHeader={
          <OrdersQueueColumnHeader
            isMobile={isMobile}
            selectMode={selectMode}
            selectionScope={selectionScope}
            gridSkin
            columns={displayColumns}
            onReorderColumns={handleReorderColumns}
            onResetColumnOrder={isCustomOrder ? handleResetColumnOrder : undefined}
            activeSort={urlDriven && isQueueColumnSort(sort) ? sort : undefined}
            sortDir={urlDriven ? dir : null}
            onSortColumn={urlDriven ? handleSortColumn : undefined}
          />
        }
        renderRow={renderRow}
        renderGroup={renderGroup}
        emptyState={
          showFirstRun ? (
            firstRunEmpty
          ) : (
            <div className="mx-auto max-w-xs rounded-xl border border-dashed border-border-soft bg-surface-canvas px-4 py-6 text-center text-role-caption text-text-muted">
              {loading ? 'Loading…' : emptyMessage}
            </div>
          )
        }
        searchEmptyState={
          <OrderSearchEmptyState
            query={searchValue}
            title={searchEmptyTitle}
            resultLabel={searchResultLabel}
            clearLabel={clearSearchLabel}
            onClear={onClearSearch}
          />
        }
      />
    </div>
  );
}
