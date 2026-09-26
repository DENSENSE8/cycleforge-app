'use client';

/**
 * Outbound › To ship — the industrial record ledger (BRIEF §4 industrial, `docs/design-system/HANDOFF-outbound-to-ship-ledger.md`).
 * {@link OrderRecordView}, placed by `DeskRecordPlane` (owner 2026-09-25): in
 * owner 2026-09-25) — toolbar + strip are the list anchor the in-place record
 */

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Image from 'next/image';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { Button, SearchField } from '@/design-system/primitives';
import {
  DataTableFilterMenu,
  DataTablePageSizeMenu,
  DataTableSortMenu,
  type DataTableFilterOption,
} from '@/components/tables/DataTable';
import { DataTableFullscreenToggle } from '@/components/tables/DataTableFullscreenToggle';
import { TableStatusBar } from '@/components/tables/TableStatusBar';
import { WorkbenchViewsMenu } from '@/components/saved-views/WorkbenchViewsMenu';
import { GridRowCheckbox } from '@/components/ui/GridRowCheckbox';
import { RecordPlatformFace } from '@/design-system/components/record-ledger/RecordIdentity';
import { OrderNumberMenuChip } from '@/components/ui/OrderNumberMenuChip';
import { ChevronDown, ChevronRight } from '@/components/Icons';
import { OrderSearchEmptyState } from '@/components/dashboard/OrderSearchEmptyState';
import { OrdersLedgerStandIn } from '@/components/dashboard/OrdersQueueFirstPaint';
import {
  useOrdersQueueFeed,
  daysLateOn,
  queueRowStaff,
  type OrdersQueueCommits,
} from '@/components/dashboard/orders-queue/useOrdersQueueFeed';
import { parentOrderLineTotals } from '@/components/dashboard/orders-queue/QueueGroupRow';
import type { QueueRowRecord } from '@/components/dashboard/orders-queue/helpers';
import type { ToShipChrome } from '@/components/unshipped/useToShipChrome';
import { DESK_RECORD_ANCHOR_ATTR, DeskRecordPlane, useDeskRecordView } from '@/design-system/components/DeskRecordPlane';
import { useRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import type { OrderRecordMode } from '@/lib/selection-context/order-inspector-context';
import { useRecordCursorKeyboard } from '@/hooks/useRecordCursorKeyboard';
import { useTableSelection, useTableSelectionTotal } from '@/hooks/useTableSelection';
import { emitSelectionTotal, emitToggleAll } from '@/lib/selection/table-selection';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import {
  clearSlotTableVisibleIds,
  publishSlotTableVisibleIds,
} from '@/lib/tables/slot-table-visible';
import {
  SLOT_TABLE_PAGE_SIZE,
  SLOT_TABLE_PAGE_SIZES,
  isSlotTablePageSize,
  pageGroupedRenderOrder,
  pageIndexForRowId,
  readSlotTablePageSize,
  writeSlotTablePageSize,
  type SlotTablePageSize,
} from '@/lib/tables/slot-table-page';
import { slotTableFindHighlightId } from '@/lib/tables/slot-table-find';
import { flattenRenderOrder, type RowGroup } from '@/lib/group-rows';
import { ordersCompoundView } from '@/lib/orders/orders-compound-view';
import { ordersNextStep } from '@/lib/orders/orders-next-step';
import { orderCarrierBoxes } from '@/lib/orders/order-group-identity';
import { resolveOrdersSlotValue } from '@/lib/tables/field-catalog/orders-resolve';
import { useOrderChannel } from '@/hooks/useCatalog';
import { marketplaceOrderUrl } from '@/utils/order-platform';
import { orderRowQtyTone } from '@/lib/condition-tone';
import { resolveOrderBin, type OrderBinFace } from '@/lib/shipping/outbound-storage-path';
import { customerFullName, customerPlace } from '@/lib/customers/customer-display';
import {
  LIFECYCLE,
  LIFECYCLE_CLASSES,
  STATE_TONE_CLASSES,
  type LifecycleState,
} from '@/design-system/tokens/lifecycle';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import {
  RECORD_FACT_KEY_CLASS,
  RECORD_ID_CLASS,
  RECORD_LABEL_CLASS,
  RECORD_NOTE_SPINE_CLASS,
  RECORD_TITLE_CLASS,
} from '@/design-system/tokens/industrial-record';
import { RecordNoteSlot } from '@/design-system/components/RecordNoteSlot';
import { LifecycleCode } from '@/design-system/components/record-ledger/LifecycleCode';
import { useLedgerRowZoom } from './useLedgerRowZoom';
import { CatalogManagerPopover } from '@/components/receiving/workspace/line-edit/CatalogManagerPopover';
import { Popover, PopoverContent, PopoverTrigger } from '@/design-system/primitives/radix-popover';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
import { OrderRecordView } from './OrderRecordView';
import { OrderRecordActionStrip } from './to-ship/MorphingRowActionMenu';
import { OrderQueueSummary, OrderQueueSummaryLine } from './OrderQueueSummary';
import { LedgerPhotoViewer } from './outbound-orders-ledger-photos';
import { linePhotoLabel } from '@/lib/photos/line-photos';
import { groupLocation, initials, recordState, worstState } from './outbound-orders-ledger-state';
import {
  LedgerCondition,
  LedgerListingLink,
  LedgerQty,
  LedgerShipBy,
  LedgerStageAssign,
  LedgerNoteField,
  stageFacts,
  stop,
} from './outbound-orders-ledger-editors';
import {
  LEDGER_BAND_CLASS,
  LEDGER_DENSITY_STYLE,
  LEDGER_GROUP_CLASS,
  LEDGER_GROUP_PX,
  LEDGER_HIT_CLASS,
  LEDGER_LEAD_CLASS,
  LEDGER_LOCATION_CLASS,
  LEDGER_PHOTO_CLASS,
  LEDGER_PHOTO_LANE_CLASS,
  LEDGER_ROW_CLASS,
  LEDGER_ROW_PX,
  LEDGER_ROW_ZOOMS,
  LEDGER_SPINE_CLASS,
  LEDGER_SPINE_HATCH_CLASS,
  LEDGER_TOOLBAR_CLASS,
  LEDGER_NESTED_HIT_CLASS,
  LEDGER_ZOOM_LABEL,
  type LedgerRowZoom,
} from './outbound-orders-ledger-geometry';

const OVERSCAN = 8;

type LedgerItem =
  | { kind: 'group'; key: string; group: RowGroup<ShippedOrder>; state: LifecycleState; folded: boolean }
  | {
      kind: 'row';
      key: string;
      record: ShippedOrder;
      state: LifecycleState;
    };

interface OutboundOrdersLedgerProps {
  /** The desk this ledger is — decides the open record's sections (`ORDER_RECORD_SECTIONS`). */
  mode: OrderRecordMode;
  chrome: ToShipChrome;
  /** The queue fetch for the CURRENT find text is still running. */
  searchPending: boolean;
  records: ShippedOrder[];
  loading: boolean;
  onOpenRecord: (record: ShippedOrder) => void;
  /** The record closed (✕, Esc, or its row left the queue) — strip the surface's deep-link param. */
  onCloseRecord: () => void;
  railSelection: boolean;
  /** Selection namespace; peers may reuse the ledger without sharing To-ship selection. */
  selectionScope?: string;
  onLoadMore?: () => void;
  /** Non-blocking band above the rows (refresh failed while rows are painted). */
  banner?: ReactNode;
  searchEmptyTitle: string;
  searchResultLabel: string;
  clearSearchLabel: string;
  /** Paperwork walk opened on one order (To-ship Labels). */
  onOpenLabels?: (record: ShippedOrder) => void;
  /**
   * The desk's own job for the open order, painted at the record's `resolve`
   * section (Exceptions: the SKU pairing form).
   */
  resolveRecord?: (record: ShippedOrder) => ReactNode;
  /**
   * Open this record once it is painted — a deep link that names one line
   * (`/search?sel=order:<id>`, `/shipping/exceptions?order=<id>`). Applied once
   * per id; the operator's own clicks own the selection after that.
   */
  openRecordId?: number | null;
}

export function OutboundOrdersLedger({
  mode,
  chrome,
  searchPending,
  records,
  loading,
  onOpenRecord,
  selectionScope = DASHBOARD_ORDERS_SELECTION_SCOPE,
  onCloseRecord,
  railSelection,
  onLoadMore,
  banner,
  searchEmptyTitle,
  searchResultLabel,
  clearSearchLabel,
  onOpenLabels,
  resolveRecord,
  openRecordId = null,
}: OutboundOrdersLedgerProps) {
  const searchValue = chrome.search.value;
  const feed = useOrdersQueueFeed({
    records,
    searchValue,
    // `/api/orders?q=` ran the match over the whole scope; `records` ARE the hits.
    searchAnsweredBy: 'server',
    onOpenRecord,
    onCloseRecord,
    selectionScope,
    railSelection,
    queueMode: 'fulfillment',
    tableId: 'orders',
    surfaceId: 'pending-grid-body',
  });
  const { plane, orderGroupsByDate, displayedRecords, painted } = feed;
  const { zoom, setZoom } = useLedgerRowZoom('orders');
  // One note overlay across the whole ledger: opening a row's note closes any other.
  const [noteOpenId, setNoteOpenId] = useState<number | null>(null);
  const openNote = useCallback((orderId: number) => setNoteOpenId(orderId), []);
  const closeNote = useCallback((orderId: number) => {
    setNoteOpenId((current) => (current === orderId ? null : current));
  }, []);
  // "Edit platforms" — the same catalog manager Unbox's platform pill opens, so
  // the short label the band paints (`AMZRN`) is edited where it is read.
  const [platformsOpen, setPlatformsOpen] = useState(false);

  // The plane publishes the record cursor; this surface turns J / K on. Esc
  // belongs to the record plane (first press closes the record, the next
  // leaves fullscreen), so the ambient hook stands down on it.
  useRecordCursorKeyboard({ enabled: true, scope: 'record', escape: false });
  const cursor = useRecordCursor('record');
  const recordView = useDeskRecordView();

  // ── Page (same page model + persisted size as the slot table) ─────────────
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState<SlotTablePageSize>(SLOT_TABLE_PAGE_SIZE);
  useEffect(() => {
    setPageSize(readSlotTablePageSize());
  }, []);
  useEffect(() => {
    setPageIndex(0);
  }, [searchValue, pageSize]);
  const paged = useMemo(
    () => pageGroupedRenderOrder(orderGroupsByDate, pageIndex, pageSize),
    [orderGroupsByDate, pageIndex, pageSize],
  );
  useEffect(() => {
    if (pageIndex > paged.pageCount - 1) setPageIndex(Math.max(0, paged.pageCount - 1));
  }, [pageIndex, paged.pageCount]);

  const visibleIds = useMemo(
    () =>
      flattenRenderOrder(paged.order)
        .map((row) => Number(row.id))
        .filter((id) => Number.isFinite(id) && id > 0),
    [paged.order],
  );
  useEffect(() => {
    publishSlotTableVisibleIds(DASHBOARD_ORDERS_SELECTION_SCOPE, visibleIds);
    emitSelectionTotal(DASHBOARD_ORDERS_SELECTION_SCOPE, visibleIds.length);
    return () => clearSlotTableVisibleIds(DASHBOARD_ORDERS_SELECTION_SCOPE);
  }, [visibleIds]);

  const scrollToKey = plane.selectedRecord
    ? String(plane.selectedRecord.id)
    : slotTableFindHighlightId({
        query: searchValue,
        paintedRowIds: painted.map((row) => String(row.id)),
      });
  const getRowKey = useCallback((r: ShippedOrder) => String(r.id), []);
  useEffect(() => {
    if (!scrollToKey) return;
    const next = pageIndexForRowId(orderGroupsByDate, pageSize, scrollToKey, getRowKey);
    if (next != null && next !== pageIndex) setPageIndex(next);
  }, [scrollToKey, getRowKey, orderGroupsByDate, pageIndex, pageSize]);

  // ── Items (fixed height per kind + zoom — the virtualizer never measures) ──
  const [foldedGroups, setFoldedGroups] = useState<ReadonlySet<string>>(() => new Set());
  const toggleFold = useCallback((key: string) => {
    setFoldedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const items = useMemo<LedgerItem[]>(() => {
    const out: LedgerItem[] = [];
    for (const [, groups] of paged.order) {
      for (const group of groups) {
        const states = group.rows.map(recordState);
        if (group.rows.length > 1) {
          const groupState = worstState(states);
          const folded = foldedGroups.has(group.key);
          out.push({ kind: 'group', key: `g:${group.key}`, group, state: groupState, folded });
          if (folded) continue;
          group.rows.forEach((record, i) =>
            out.push({ kind: 'row', key: `r:${record.id}`, record, state: states[i]! }),
          );
          continue;
        }
        const record = group.rows[0];
        if (record) out.push({ kind: 'row', key: `r:${record.id}`, record, state: states[0]! });
      }
    }
    return out;
  }, [paged.order, foldedGroups]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) =>
      items[index]?.kind === 'group' ? LEDGER_GROUP_PX[zoom] : LEDGER_ROW_PX[zoom],
    getItemKey: (index) => items[index]?.key ?? index,
    overscan: OVERSCAN,
  });
  useEffect(() => {
    virtualizer.measure();
  }, [virtualizer, zoom, items]);
  useEffect(() => {
    if (!scrollToKey) return;
    const idx = items.findIndex((it) => it.kind === 'row' && String(it.record.id) === scrollToKey);
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: 'auto' });
  }, [scrollToKey, items, virtualizer]);

  // ── Selection chrome ───────────────────────────────────────────────────────
  const selectedRows = useTableSelection<{ id?: number | string }>(
    DASHBOARD_ORDERS_SELECTION_SCOPE,
    (r) => Number(r.id),
  );
  const selectionTotal = useTableSelectionTotal(DASHBOARD_ORDERS_SELECTION_SCOPE);
  const selectedCount = selectedRows.length;
  const allSelected = selectionTotal > 0 && selectedCount >= selectionTotal;

  const filterActive = chrome.filter.options.some((o: DataTableFilterOption) => o.active);
  const isNarrowed = Boolean(searchValue.trim()) || filterActive;
  const openId = plane.selectedRecord ? Number(plane.selectedRecord.id) : null;
  // The record reads the LIVE row (optimistic edits land there), not the
  // snapshot the selection plane captured when the row was opened.
  const openRecord = useMemo(
    () =>
      openId == null
        ? null
        : (displayedRecords.find((r) => Number(r.id) === openId) ?? plane.selectedRecord),
    [openId, displayedRecords, plane.selectedRecord],
  );

  const seededOpenIdRef = useRef<number | null>(null);
  const openRow = plane.handleRowAction;
  useEffect(() => {
    // The param cleared (the record closed): the same id may be named again.
    if (openRecordId == null) {
      seededOpenIdRef.current = null;
      return;
    }
    if (seededOpenIdRef.current === openRecordId) return;
    const target = displayedRecords.find((r) => Number(r.id) === openRecordId);
    if (!target) return;
    seededOpenIdRef.current = openRecordId;
    if (openId !== openRecordId) openRow(target);
  }, [openRecordId, displayedRecords, openId, openRow]);

  const focusFirstRow = useCallback(() => {
    scrollRef.current?.querySelector<HTMLElement>('[data-ledger-open]')?.focus();
  }, []);

  // Stable across renders so a memoized record repaints only when ITS facts move.
  const {
    handleCommitCondition,
    handleCommitShipBy,
    handleCommitStageAssign,
    handleCommitSubtitleField,
    handleCommitPlatform,
    handleCommitSkuBin,
    handleCommitTracking,
  } = feed;
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

  const openOrderRef = openRecord ? String(openRecord.order_id ?? '').trim() || `#${openRecord.id}` : '';

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 bg-mode-canvas text-mode-ink"
      style={LEDGER_DENSITY_STYLE}
    >
    <DeskRecordPlane
      open={openRecord != null}
      onClose={plane.closeRecord}
      title={openRecord ? `Order ${openOrderRef}` : 'Order'}
      subtitle={openRecord?.product_title?.trim() || undefined}
      indexLabel={cursor.available && cursor.position != null ? `${cursor.position} of ${cursor.total}` : undefined}
      onPrev={cursor.onPrev ?? undefined}
      onNext={cursor.onNext ?? undefined}
      prevDisabled={cursor.prevDisabled}
      nextDisabled={cursor.nextDisabled}
      recordNoun="order"
      recordKey={openId != null ? String(openId) : null}
      summary={<OrderQueueSummary records={displayedRecords} todayKey={feed.todayKey} />}
      testId="order-record"
      list={
    <div data-testid="pending-grid-body" className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* ── The list anchor: toolbar + the open record's action strip. In
          place the record opens below it; both stay live over the record. ── */}
      <div {...{ [DESK_RECORD_ANCHOR_ATTR]: '' }} className="flex min-w-0 shrink-0 flex-col">
      {/* ── Toolbar: read · narrow · order · views · page — gap — draw ─────── */}
      <div
        data-testid="data-table-toolbar"
        className={cn(LEDGER_TOOLBAR_CLASS, LEDGER_NESTED_HIT_CLASS)}
      >
        <GridRowCheckbox
          checked={allSelected ? true : selectedCount > 0 ? 'mixed' : false}
          onToggle={() =>
            emitToggleAll(DASHBOARD_ORDERS_SELECTION_SCOPE, allSelected ? 'none' : 'all')
          }
          label={allSelected ? 'Clear selection' : 'Select all orders on this page'}
          className={cn(LEDGER_HIT_CLASS, 'w-8 items-center pt-0')}
        />
        <SearchField
          value={searchValue}
          onChange={chrome.search.onChange}
          placeholder={chrome.search.placeholder}
          isSearching={searchPending}
          onNavigateResults={focusFirstRow}
          inputRef={(el) => {
            if (el) el.setAttribute('aria-label', chrome.search.placeholder);
          }}
          className="min-w-0 max-w-[22rem] flex-1 overflow-hidden rounded-none"
          tone="neutral"
          hideUnderline
          fillHost
        />
        <DataTableFilterMenu {...chrome.filter} />
        <DataTableSortMenu {...feed.sortMenu} />
        {feed.views ? (
          <div data-testid="data-table-views" className="inline-flex shrink-0 items-center">
            <WorkbenchViewsMenu
              storageKey={feed.views.storageKey}
              paramKeys={feed.views.paramKeys}
              emptyHint={feed.views.emptyHint}
            />
          </div>
        ) : null}
        <DataTablePageSizeMenu
          pageSize={pageSize}
          pageSizes={SLOT_TABLE_PAGE_SIZES}
          onPageSizeChange={(size) => {
            if (!isSlotTablePageSize(size)) return;
            writeSlotTablePageSize(size);
            setPageSize(size);
          }}
        />
        <span className="ml-auto inline-flex shrink-0 items-stretch">
          <button
            type="button"
            data-testid="ledger-edit-platforms"
            aria-haspopup="dialog"
            onClick={() => setPlatformsOpen(true)}
            className={cn(
              'ds-raw-button inline-flex items-center border-l border-mode-edge px-3',
              LEDGER_HIT_CLASS,
              RECORD_LABEL_CLASS,
              focusRing('cell'),
              'text-mode-muted hover:bg-mode-hover hover:text-mode-ink',
            )}
          >
            Edit platforms
          </button>
          <div role="group" aria-label="Row size" className="inline-flex items-stretch border-l border-mode-edge">
            {LEDGER_ROW_ZOOMS.map((step) => (
              <button
                key={step}
                type="button"
                aria-pressed={zoom === step}
                aria-label={LEDGER_ZOOM_LABEL[step]}
                data-testid={`ledger-zoom-${step}`}
                onClick={() => setZoom(step)}
                className={cn(
                  'ds-raw-button inline-flex w-8 items-center justify-center border-r border-mode-edge',
                  LEDGER_HIT_CLASS,
                  RECORD_LABEL_CLASS,
                  focusRing('cell'),
                  zoom === step ? 'bg-mode-ink text-mode-bar' : 'text-mode-muted hover:bg-mode-hover',
                )}
              >
                {step}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Adjust row density" className="inline-flex items-stretch border-l border-mode-edge">
            <button
              type="button"
              data-testid="ledger-density-decrease"
              aria-label="Decrease row density"
              disabled={zoom === LEDGER_ROW_ZOOMS[0]}
              onClick={() => {
                const index = LEDGER_ROW_ZOOMS.indexOf(zoom);
                if (index > 0) setZoom(LEDGER_ROW_ZOOMS[index - 1]);
              }}
              className={cn(
                'ds-raw-button inline-flex w-8 items-center justify-center border-r border-mode-edge',
                LEDGER_HIT_CLASS,
                RECORD_LABEL_CLASS,
                focusRing('cell'),
                'text-mode-muted hover:bg-mode-hover disabled:cursor-not-allowed disabled:opacity-40',
              )}
            >
              −
            </button>
            <button
              type="button"
              data-testid="ledger-density-increase"
              aria-label="Increase row density"
              disabled={zoom === LEDGER_ROW_ZOOMS[LEDGER_ROW_ZOOMS.length - 1]}
              onClick={() => {
                const index = LEDGER_ROW_ZOOMS.indexOf(zoom);
                if (index < LEDGER_ROW_ZOOMS.length - 1) setZoom(LEDGER_ROW_ZOOMS[index + 1]);
              }}
              className={cn(
                'ds-raw-button inline-flex w-8 items-center justify-center border-r border-mode-edge',
                LEDGER_HIT_CLASS,
                RECORD_LABEL_CLASS,
                focusRing('cell'),
                'text-mode-muted hover:bg-mode-hover disabled:cursor-not-allowed disabled:opacity-40',
              )}
            >
              +
            </button>
          </div>
          <DataTableFullscreenToggle />
        </span>
      </div>
      {openRecord ? (
        <OrderRecordActionStrip
          key={openRecord.id}
          record={openRecord}
          mode={mode}
          checked={plane.selectedIds.has(Number(openRecord.id))}
          onToggleSelect={plane.handleToggleSelect}
          onOpenLabels={onOpenLabels}
        />
      ) : null}
      </div>
      <CatalogManagerPopover open={platformsOpen} kind="platform" onClose={() => setPlatformsOpen(false)} />

      {banner}

      {/* ── Records ────────────────────────────────────────────────────────── */}
      <div className="relative isolate flex min-h-0 min-w-0 flex-1 flex-col">
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          {items.length === 0 ? (
            loading || searchPending ? (
              <OrdersLedgerStandIn rows={[]} zoom={zoom} />
            ) : (
              <div className="flex min-h-60 flex-col items-center justify-center gap-2 border-b border-mode-ink text-center">
                {isNarrowed ? (
                  <OrderSearchEmptyState
                    query={searchValue}
                    title={searchEmptyTitle}
                    resultLabel={searchResultLabel}
                    clearLabel={clearSearchLabel}
                    onClear={() => chrome.search.onChange('')}
                  />
                ) : (
                  <>
                    <b className="text-role-body font-bold text-mode-ink">No orders to ship</b>
                    <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>Queue clear</span>
                  </>
                )}
              </div>
            )
          ) : (
            <div
              role="list"
              aria-label="Orders to ship"
              aria-busy={loading || searchPending}
              className="relative w-full"
              style={{ height: virtualizer.getTotalSize() }}
            >
              {virtualizer.getVirtualItems().map((v) => {
                const item = items[v.index];
                if (!item) return null;
                return (
                  <div
                    key={v.key}
                    role="listitem"
                    className="absolute left-0 top-0 w-full"
                    style={{ transform: `translateY(${v.start}px)` }}
                  >
                    {item.kind === 'group' ? (
                      <LedgerGroupRecord
                        group={item.group}
                        state={item.state}
                        folded={item.folded}
                        zoom={zoom}
                        selectedIds={plane.selectedIds}
                        onToggleFold={toggleFold}
                        onToggleGroup={plane.handleToggleGroup}
                        getStaffName={feed.getStaffName}
                        commits={commits}
                      />
                    ) : (
                      <LedgerRecord
                        record={item.record}
                        state={item.state}
                        zoom={zoom}
                        open={openId === Number(item.record.id)}
                        noteOpen={noteOpenId === Number(item.record.id)}
                        onOpenNote={openNote}
                        onCloseNote={closeNote}
                        checked={plane.selectedIds.has(Number(item.record.id))}
                        todayKey={feed.todayKey}
                        getStaffName={feed.getStaffName}
                        onRowAction={plane.handleRowAction}
                        onToggleSelect={plane.handleToggleSelect}
                        commits={commits}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <TableStatusBar
        // In place the queue summary rides the list's foot; split, the empty pane shows it.
        lead={recordView === 'in-place' ? <OrderQueueSummaryLine records={displayedRecords} todayKey={feed.todayKey} /> : undefined}
        shown={paged.shown}
        total={paged.total}
        selected={selectedCount}
        pager={{
          pageIndex: paged.pageIndex,
          pageCount: paged.pageCount,
          onPrev: () => setPageIndex((i) => Math.max(0, i - 1)),
          onNext: () => {
            if (paged.pageIndex < paged.pageCount - 1) {
              setPageIndex(paged.pageIndex + 1);
              return;
            }
            onLoadMore?.();
            setPageIndex(paged.pageIndex + 1);
          },
          nextDisabled: paged.pageIndex >= paged.pageCount - 1 && !onLoadMore,
        }}
        onLoadMore={onLoadMore}
      />
    </div>
      }
    >
      {openRecord ? (
        <OrderRecordView
          mode={mode}
          record={openRecord}
          records={displayedRecords}
          todayKey={feed.todayKey}
          getStaffName={feed.getStaffName}
          commits={commits}
          resolve={resolveRecord?.(openRecord)}
        />
      ) : null}
    </DeskRecordPlane>
    </div>
  );
}

// ── Seed group parent ───────────────────────────────────────────────────────

/**
 * One stage (pick or pack) across a group's lines: the assignee every line
 * shares (or nobody), stamped only when every line is. Assigning from the
 * parent writes each line that is not yet stamped — one verb for the order.
 */
function groupStage(
  rows: readonly ShippedOrder[],
  fieldId: 'orders.picked' | 'orders.packed',
  getStaffName: (id: number) => string,
) {
  const lines = rows.map((row) => {
    const staff = queueRowStaff(row as QueueRowRecord, getStaffName);
    return {
      row,
      facts: stageFacts(resolveOrdersSlotValue(row, fieldId, staff)),
      staffId: fieldId === 'orders.picked' ? staff.testerId : staff.packerId,
      display: fieldId === 'orders.picked' ? staff.testerDisplay : staff.packerDisplay,
    };
  });
  const first = lines[0];
  const shared = first != null && lines.every((line) => line.staffId === first.staffId);
  const allDone = lines.length > 0 && lines.every((line) => Boolean(line.facts?.at));
  return {
    facts: allDone ? (first?.facts ?? null) : null,
    selectedStaffId: shared ? (first?.staffId ?? null) : null,
    assignedName: shared ? (first?.display ?? '---') : '---',
    open: lines.filter((line) => !line.facts?.at).map((line) => line.row),
  };
}

const LedgerGroupRecord = memo(function LedgerGroupRecord({
  group,
  state,
  folded,
  zoom,
  selectedIds,
  onToggleFold,
  onToggleGroup,
  getStaffName,
  commits,
}: {
  group: RowGroup<ShippedOrder>;
  state: LifecycleState;
  folded: boolean;
  zoom: LedgerRowZoom;
  selectedIds: ReadonlySet<number>;
  onToggleFold: (key: string) => void;
  onToggleGroup: (ids: readonly number[], checked: boolean) => void;
  getStaffName: (id: number) => string;
  commits: OrdersQueueCommits;
}) {
  const ids = group.rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0);
  const checkedCount = ids.filter((id) => selectedIds.has(id)).length;
  const checked = checkedCount === 0 ? false : checkedCount === ids.length ? true : ('mixed' as const);
  const lead = group.rows[0]!;
  const orderId = String(lead.order_id || group.key || '').trim();
  const { boxCount } = orderCarrierBoxes(group.rows);
  const { qty } = parentOrderLineTotals(group.rows);
  const inState = group.rows.filter((row) => recordState(row) === state).length;
  // Band face = the org's dense short label (`AMZRN`); the full name rides the
  // tooltip and the order-number menu.
  const channel = useOrderChannel()(orderId, lead.account_source);
  const meta = channel.meta;
  const spec = LIFECYCLE[state];
  const where = groupLocation(group.rows);
  // The order's next step is its worst line's: that line is what holds it.
  const worst = group.rows.find((row) => recordState(row) === state) ?? lead;
  const next = ordersNextStep(worst);
  const pick = groupStage(group.rows, 'orders.picked', getStaffName);
  const pack = groupStage(group.rows, 'orders.packed', getStaffName);

  return (
    <div
      data-order-group-key={group.key}
      className={cn(
        'relative flex border-b border-mode-ink bg-mode-bar',
        LEDGER_GROUP_CLASS[zoom],
      )}
    >
      <span
        className={cn(
          LEDGER_SPINE_CLASS,
          LIFECYCLE_CLASSES[state].dot,
          state === 'outOfStock' && LEDGER_SPINE_HATCH_CLASS,
        )}
        aria-hidden
      />
      {/* The fold chevron sits in a lane the photo's width, so the band below
          starts on the records' x (owner 2026-09-25: columns aligned). */}
      <button
        type="button"
        aria-expanded={!folded}
        aria-label={`${folded ? 'Expand' : 'Collapse'} order ${orderId}, ${group.rows.length} lines`}
        onClick={() => onToggleFold(group.key)}
        className={cn(
          'ds-raw-button inline-flex shrink-0 items-center justify-center border-r border-mode-rule text-mode-muted hover:bg-mode-hover',
          LEDGER_PHOTO_LANE_CLASS[zoom],
          LEDGER_HIT_CLASS,
          focusRing('cell'),
        )}
      >
        {folded ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {/* One band carries the whole order, on the records' columns: */}
      <div className={cn('flex min-w-0 flex-1 items-center gap-3', LEDGER_BAND_CLASS[zoom])}>
        <span className={LEDGER_LEAD_CLASS}>
          <GridRowCheckbox
            checked={checked}
            onToggle={() => onToggleGroup(ids, checked !== true)}
            label={`Select all ${group.rows.length} lines of order ${orderId}`}
            className={cn(LEDGER_HIT_CLASS, 'w-8 items-center pt-0')}
          />
          <LifecycleCode
            state={state}
            className="w-25 shrink-0"
            srLabel={`${spec.label}: ${inState} of ${group.rows.length} lines`}
          >
            {spec.code} {inState}/{group.rows.length}
          </LifecycleCode>
          <RecordPlatformFace channel={channel} />
          <span
            className={cn(RECORD_ID_CLASS, LEDGER_NESTED_HIT_CLASS, 'flex w-40 shrink-0 items-center truncate')}
            onClick={stop}
            onPointerDown={stop}
          >
            <OrderNumberMenuChip
              value={orderId}
              platformLabel={meta.value ? meta.label : null}
              openHref={marketplaceOrderUrl(orderId, lead.account_source)}
              plain
              dense
            />
          </span>
        </span>
        {/* Under the buyer / SKU column. Narrow at a 1440 desk: the location
            (law 1) keeps the room, the box · line count gives it up first.
            Clipped, so a split-view list never paints QTY over Pick. */}
        <span
          className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden"
          title={`${where.path ?? 'No bin'} · ${boxCount} ${boxCount === 1 ? 'box' : 'boxes'} · ${group.rows.length} lines · QTY ${qty}`}
        >
          <span className={cn('flex min-w-0 shrink items-center gap-1 truncate', RECORD_ID_CLASS)}>
            <LedgerLocation path={where.path} className="min-w-0" />
            {where.path && where.unassigned > 0 ? (
              <span className="shrink-0 text-mode-warn">· {where.unassigned} unassigned</span>
            ) : null}
          </span>
          <span className={cn(RECORD_LABEL_CLASS, 'min-w-0 shrink-[8] truncate text-mode-muted')}>
            {boxCount} {boxCount === 1 ? 'box' : 'boxes'} · {group.rows.length} lines
          </span>
          <span className={cn(RECORD_LABEL_CLASS, 'shrink-0', orderRowQtyTone(qty))}>QTY {qty}</span>
        </span>
        <span className="h-full w-32 shrink-0">
          <LedgerStageAssign
            verb="Pick"
            doneVerb="Picked"
            role="technician"
            facts={pick.facts}
            selectedStaffId={pick.selectedStaffId}
            assignedName={pick.assignedName}
            showStamp
            onCommit={(id, name) => {
              for (const row of pick.open) commits.handleCommitStageAssign(row, 'orders.picked', id, name);
            }}
          />
        </span>
        <span className="h-full w-32 shrink-0">
          <LedgerStageAssign
            verb="Pack"
            doneVerb="Packed"
            role="packer"
            facts={pack.facts}
            selectedStaffId={pack.selectedStaffId}
            assignedName={pack.assignedName}
            showStamp
            onCommit={(id, name) => {
              for (const row of pack.open) commits.handleCommitStageAssign(row, 'orders.packed', id, name);
            }}
          />
        </span>
        <LedgerNextStep next={next} />
      </div>
    </div>
  );
});

/** `→ Pick` / `→ Label` … — where the record (or the order) goes next. */
function LedgerNextStep({ next }: { next: { label: string; tip?: string; blocked?: boolean } | null }) {
  return (
    <span
      title={next?.tip}
      className={cn(
        RECORD_LABEL_CLASS,
        'flex h-full w-32 shrink-0 items-center border-l border-mode-edge px-2',
        next?.blocked ? STATE_TONE_CLASSES.danger.text : 'text-mode-ink',
      )}
    >
      {next?.label ?? ''}
    </span>
  );
}
/**
 * The row's note slot toggles an inline note editor under it:
 * (owner 2026-09-25: add a note in place). Open state lives on the ledger (one
 */
function LedgerNoteEditor({
  orderId,
  note,
  open,
  onOpen,
  onClose,
}: {
  orderId: number;
  note: string | null;
  open: boolean;
  onOpen: (orderId: number) => void;
  onClose: (orderId: number) => void;
}) {
  const [visibleNote, setVisibleNote] = useState(note ?? '');
  const triggerRef = useRef<HTMLSpanElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisibleNote(note ?? '');
  }, [orderId, note]);

  // Capture phase: row controls stop pointerdown propagation, which would hide
  // the press from Radix's own outside-dismiss and leave this overlay open.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || contentRef.current?.contains(target)) return;
      onClose(orderId);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open, onClose, orderId]);

  const hasNote = Boolean(visibleNote.trim());

  return (
    <Popover open={open} onOpenChange={(next) => (next ? onOpen(orderId) : onClose(orderId))}>
      <span ref={triggerRef} className="inline-flex w-11 shrink-0 items-center pointer-events-auto">
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            radius="flush"
            aria-label={open ? 'Close note' : hasNote ? 'Open note' : 'Add note'}
            data-testid="ledger-note-trigger"
            onClick={stop}
            onPointerDown={stop}
            className={cn(
              '!h-auto !min-h-0 !w-11 !justify-center !gap-0 !px-0 !py-0 !transform-none hover:opacity-80',
              open && 'outline outline-2 -outline-offset-2 outline-mode-ink',
            )}
          >
            <RecordNoteSlot note={hasNote ? visibleNote : null} empty="add" />
          </Button>
        </PopoverTrigger>
      </span>
      <PopoverContent
        ref={contentRef}
        align="start"
        sideOffset={4}
        className="w-64 max-w-[calc(100vw-2rem)] rounded-none border-0 bg-transparent p-0 shadow-none"
        onClick={stop}
        onPointerDown={stop}
        // Never hand focus back to the badge on close: it painted a focus ring
        // around NOTE after Enter, and stole focus from another row's overlay.
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {/* Portals out of the ledger's industrial region; re-declare it. */}
        <ModeRegion mode="industrial" className="block border border-mode-ink bg-mode-panel p-1.5 shadow-lg">
          <LedgerNoteField
            orderId={orderId}
            note={visibleNote}
            onSaved={setVisibleNote}
            onDone={() => onClose(orderId)}
          />
        </ModeRegion>
      </PopoverContent>
    </Popover>
  );
}

// ── One record ──────────────────────────────────────────────────────────────

interface LedgerRecordProps {
  record: ShippedOrder;
  state: LifecycleState;
  zoom: LedgerRowZoom;
  open: boolean;
  checked: boolean;
  /** This row's NOTE overlay is the one open on the ledger. */
  noteOpen: boolean;
  onOpenNote: (orderId: number) => void;
  onCloseNote: (orderId: number) => void;
  todayKey: string;
  getStaffName: (id: number) => string;
  onRowAction: (
    record: ShippedOrder,
    event?: { shiftKey: boolean; detail?: number; target?: EventTarget | null },
  ) => void;
  onToggleSelect: (record: ShippedOrder, event: { shiftKey: boolean }) => void;
  commits: OrdersQueueCommits;
}

const LedgerRecord = memo(function LedgerRecord({
  record,
  state,
  zoom,
  open,
  checked,
  noteOpen,
  onOpenNote,
  onCloseNote,
  todayKey,
  getStaffName,
  onRowAction,
  onToggleSelect,
  commits,
}: LedgerRecordProps) {
  const r = record as QueueRowRecord;
  const staff = queueRowStaff(r, getStaffName);
  const view = ordersCompoundView(record, {
    stateLabel: null,
    delayDays: daysLateOn(
      todayKey,
      (r.deadline_at as string | null | undefined) || (r.ship_by_date as string | null | undefined),
    ),
    todayKey,
  });
  const spec = LIFECYCLE[state];
  const orderId = view.orderId ?? '';
  const channel = useOrderChannel()(orderId, view.platformValue);
  const meta = channel.meta;
  const qty = Number(record.quantity);
  const qtyFace = Number.isFinite(qty) && qty > 0 ? qty : 1;
  const next = view.nextStep ?? null;
  const [photosOpen, setPhotosOpen] = useState(false);
  const closePhotos = useCallback(() => setPhotosOpen(false), []);
  const bin = resolveOrderBin(record.storage_locations, record.sku_home_location);
  const locationFace = (
    <LedgerLocation path={bin.path} source={bin.source} className={LEDGER_LOCATION_CLASS[zoom]} />
  );

  const pickFacts = stageFacts(resolveOrdersSlotValue(record, 'orders.picked', staff));
  const packFacts = stageFacts(resolveOrdersSlotValue(record, 'orders.packed', staff));

  const shipBy = (
    <LedgerShipBy
      dateKey={view.delay?.dateKey ?? null}
      overdueDays={view.delay?.overdue ? view.delay.days : 0}
      dueToday={Boolean(view.delay?.dueToday)}
      tip={view.delayTip}
      onCommit={(key) => commits.handleCommitShipBy(record, key)}
    />
  );
  const pick = (
    <LedgerStageAssign
      verb="Pick"
      doneVerb="Picked"
      role="technician"
      facts={pickFacts}
      selectedStaffId={staff.testerId}
      assignedName={staff.testerDisplay}
      showStamp
      onCommit={(id, name) => commits.handleCommitStageAssign(record, 'orders.picked', id, name)}
    />
  );
  const pack = (
    <LedgerStageAssign
      verb="Pack"
      doneVerb="Packed"
      role="packer"
      facts={packFacts}
      selectedStaffId={staff.packerId}
      assignedName={staff.packerDisplay}
      showStamp
      onCommit={(id, name) => commits.handleCommitStageAssign(record, 'orders.packed', id, name)}
    />
  );
  const code = <LifecycleCode state={state} className="w-11 shrink-0" />;
  // Buyer note: a rigid slot beside the state code on every record, so a noted
  // and an un-noted row keep platform and order # on the same pixel.
  const buyerNote = String(record.buyer_note ?? record.notes ?? '').trim() || null;
  const noteSlot = (
    <LedgerNoteEditor
      orderId={Number(record.id)}
      note={buyerNote}
      open={noteOpen}
      onOpen={onOpenNote}
      onClose={onCloseNote}
    />
  );
  const orderChip = (
    <span
      className={cn(RECORD_ID_CLASS, LEDGER_NESTED_HIT_CLASS, 'flex w-40 shrink-0 items-center truncate')}
      onClick={stop}
      onPointerDown={stop}
    >
      <OrderNumberMenuChip
        value={orderId}
        platformLabel={meta.value ? meta.label : null}
        openHref={marketplaceOrderUrl(orderId, view.platformValue)}
        plain
        dense
      />
    </span>
  );
  // Condition rides beside the select box at every zoom (owner 2026-09-24):
  // the grade is what the hand checks while it holds the item.
  const condition = (
    <LedgerCondition
      value={record.condition ?? null}
      onCommit={(value) => commits.handleCommitCondition(record, value)}
    />
  );
  const check = (
    <GridRowCheckbox
      checked={checked}
      onToggle={(event) => onToggleSelect(record, event)}
      label={`Select order ${orderId || record.id}`}
      className={cn(LEDGER_HIT_CLASS, 'w-8 items-center pt-0')}
    />
  );
  // The buyer, from the customer book (`/api/orders` joins it), in band 1's free span; S has no free span, so it reads in the order record only.
  const customerName = record.customer ? customerFullName(record.customer) : '';
  const customerWhere = record.customer ? customerPlace(record.customer) : '';
  const customerFace =
    customerName || customerWhere ? (
      <span
        data-testid="ledger-customer"
        className="flex min-w-0 items-baseline gap-2"
        title={[customerName, customerWhere].filter(Boolean).join(' · ')}
      >
        <span className="truncate text-role-data text-mode-ink">{customerName}</span>
        {customerWhere ? (
          <span className={cn(RECORD_LABEL_CLASS, 'min-w-0 shrink-[4] truncate text-mode-muted')}>{customerWhere}</span>
        ) : null}
      </span>
    ) : null;

  return (
    <div
      data-order-row-id={record.id}
      data-desk-record-key={record.id}
      data-state={state}
      className={cn(
        'group/record relative flex border-b border-mode-ink bg-mode-panel hover:bg-mode-hover hover:z-dropdown focus-within:z-dropdown',
        LEDGER_ROW_CLASS[zoom],
        (open || checked) && 'outline outline-2 -outline-offset-2 outline-mode-ink',
      )}
    >
      {/* The row's open target: */}
      <button
        type="button"
        data-ledger-open=""
        aria-label={`Order ${orderId || record.id}, ${spec.label}, ${record.product_title || 'item'}`}
        aria-current={open || undefined}
        onClick={(event) =>
          onRowAction(record, { shiftKey: event.shiftKey, detail: event.detail, target: event.target })
        }
        className={cn('absolute inset-0 z-0 cursor-pointer', focusRing('cell'))}
      />
      {/* A seed-group child wears ONE line — its own state spine. The parent
          band above carries the grouping; a second group spine + indent lane
          read as a double rule (owner 2026-09-24). */}
      <span
        className={cn(
          LEDGER_SPINE_CLASS,
          'pointer-events-none relative z-10',
          LIFECYCLE_CLASSES[state].dot,
          state === 'outOfStock' && LEDGER_SPINE_HATCH_CLASS,
          buyerNote && RECORD_NOTE_SPINE_CLASS,
        )}
        aria-hidden
      />
      {/* The photo lane opens every photo of this item # + SKU (Unbox's viewer). */}
      <button
        type="button"
        aria-label={`Photos for ${linePhotoLabel(record.item_number ?? null, view.detail?.sku ?? null)}`}
        data-testid="ledger-photos"
        onClick={(event) => {
          event.stopPropagation();
          setPhotosOpen(true);
        }}
        onPointerDown={stop}
        className={cn(
          'ds-raw-button relative z-10 shrink-0 cursor-zoom-in overflow-hidden border-r border-mode-rule bg-mode-well',
          focusRing('cell'),
          LEDGER_PHOTO_CLASS[zoom],
        )}
      >
        {view.thumbUrl ? (
          <Image
            src={view.thumbUrl}
            alt=""
            fill
            unoptimized
            sizes="108px"
            className="object-cover"
          />
        ) : (
          <span
            className={cn(
              'flex h-full w-full items-center justify-center font-mono font-black text-mode-muted',
              zoom === 'S' ? 'text-role-micro' : 'text-role-body',
            )}
            aria-hidden
          >
            {initials(view.title)}
          </span>
        )}
      </button>
      {photosOpen ? (
        <LedgerPhotoViewer
          subject={{
            skuCatalogId: Number(r.sku_catalog_id) > 0 ? Number(r.sku_catalog_id) : null,
            sku: view.detail?.sku ?? record.sku ?? null,
            itemNumber: record.item_number ?? null,
            catalogImageUrl: view.thumbUrl ?? null,
          }}
          onClose={closePhotos}
        />
      ) : null}

      {zoom === 'S' ? (
        <div
          className={cn(
            'pointer-events-none relative z-10 flex min-w-0 flex-1 items-center gap-2 pr-2',
            LEDGER_BAND_CLASS.S,
          )}
        >
          <span className="pointer-events-auto">{check}</span>
          <span className="pointer-events-auto w-20 shrink-0">{condition}</span>
          {code}
          {noteSlot}
          {locationFace}
          <span className="pointer-events-auto">{orderChip}</span>
          <span className={cn(RECORD_TITLE_CLASS, 'flex-1')}>{view.title || '—'}</span>
          <span className={cn(RECORD_LABEL_CLASS, 'w-14 shrink-0 text-right', orderRowQtyTone(qtyFace))}>
            QTY {qtyFace}
          </span>
          <span className="pointer-events-auto w-28 shrink-0">{shipBy}</span>
          <span className="pointer-events-auto w-32 shrink-0">{pick}</span>
          <span className="pointer-events-auto w-32 shrink-0">{pack}</span>
        </div>
      ) : (
        <div className="pointer-events-none relative z-10 flex min-w-0 flex-1 flex-col">
          {/*
            F-pattern (owner 2026-09-24): Context → Identity → Execution, with
            one right column down all three bands (date · QTY · next).
          */}
          {/* Band 1 — context: ☐ · state · platform · order # ··· buyer · listing · date.
              The lead column is shared with band 3, so the buyer and the SKU start on
              one x (owner 2026-09-25). */}
          <div className={cn('flex min-w-0 items-center gap-3 border-b border-mode-rule', LEDGER_BAND_CLASS[zoom])}>
            <span className={LEDGER_LEAD_CLASS}>
              <span className="pointer-events-auto">{check}</span>
              {code}
              {noteSlot}
              <RecordPlatformFace channel={channel} />
              <span className="pointer-events-auto">{orderChip}</span>
            </span>
            <span className="flex min-w-0 flex-1 items-center">{customerFace}</span>
            <span className="pointer-events-auto h-full shrink-0">
              <LedgerListingLink href={view.titleHref ?? null} itemNumber={record.item_number ?? null} />
            </span>
            <span className="cf-section-rule pointer-events-auto h-full w-32 shrink-0 border-l border-mode-edge">{shipBy}</span>
          </div>
          {/* Band 2 — identity: what it is ··· how many (the labour multiplier). */}
          <div className={cn('flex min-w-0 items-center gap-3 border-b border-mode-rule pl-2', LEDGER_BAND_CLASS[zoom])}>
            <span className={cn(RECORD_TITLE_CLASS, 'flex-1')} title={view.title || undefined}>
              {view.title || '—'}
            </span>
            <span className="cf-section-rule pointer-events-auto h-full w-32 shrink-0 border-l border-mode-edge">
              <LedgerQty
                value={qtyFace}
                onCommit={(value) => commits.handleCommitSubtitleField(record, 'orders.qty', value)}
              />
            </span>
          </div>
          {/*
 * Band 3 — execution:
 * side (owner 2026-09-25). Price is not here: it is noise on the floor and
 */}
          <div className={cn('flex min-w-0 items-center gap-3', LEDGER_BAND_CLASS[zoom])}>
            <span className={cn(LEDGER_LEAD_CLASS, 'pl-2')}>
              <span className="pointer-events-auto w-20 shrink-0">{condition}</span>
              <LedgerLocation path={bin.path} source={bin.source} className="min-w-0 flex-1" />
            </span>
            <span
              className={cn(RECORD_ID_CLASS, 'w-44 min-w-0 shrink truncate text-mode-ink')}
              title={view.detail?.sku ?? undefined}
            >
              <span className={RECORD_FACT_KEY_CLASS}>SKU </span>
              {view.detail?.sku ?? '—'}
            </span>
            <span className="min-w-0 flex-1" aria-hidden />
            <span className="pointer-events-auto w-32 shrink-0">{pick}</span>
            <span className="pointer-events-auto w-32 shrink-0">{pack}</span>
            <LedgerNextStep next={next} />
          </div>
        </div>
      )}
    </div>
  );
});

/** The order's WHERE — every live allocation's warehouse breadcrumb, from the server (`storage_locations`) through the formatter `/m/work`… */
function LedgerLocation({
  path,
  source = path ? 'allocation' : null,
  className,
}: {
  path: string | null;
  source?: OrderBinFace['source'];
  className?: string;
}) {
  const home = source === 'sku_home';
  return (
    <span
      className={cn(RECORD_ID_CLASS, 'truncate', path ? 'text-mode-ink' : 'text-mode-warn', className)}
      title={path ? (home ? `${path} — SKU home bin, no unit allocated yet` : path) : 'No allocated location'}
    >
      <span className={RECORD_FACT_KEY_CLASS}>{home ? 'BIN HOME ' : 'BIN '}</span>
      {path ?? 'UNASSIGNED'}
    </span>
  );
}
