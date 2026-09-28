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
import { Button } from '@/design-system/primitives';
import {
  type DataTableFilterOption,
} from '@/components/tables/DataTable';
import { TableStatusBar } from '@/components/tables/TableStatusBar';
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
import type { QueueRowClickEvent } from '@/components/dashboard/orders-queue/queue-row-click';
import type { QueueRowRecord } from '@/components/dashboard/orders-queue/helpers';
import type { ToShipChrome } from '@/components/unshipped/useToShipChrome';
import {
  DESK_RECORD_ANCHOR_ATTR,
  DeskRecordPlane,
  deskRecordBesideList,
  useDeskRecordView,
} from '@/design-system/components/DeskRecordPlane';
import { useRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import {
  VIEW_SPECS,
  rowFactsAt,
  type OrderListViewKey,
} from '@/lib/views/view-specs';
import type { OrdersFactId } from '@/lib/tables/field-catalog/orders';
import { useRecordCursorKeyboard } from '@/hooks/useRecordCursorKeyboard';
import { emitSelectionTotal } from '@/lib/selection/table-selection';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import {
  clearSlotTableVisibleIds,
  publishSlotTableVisibleIds,
} from '@/lib/tables/slot-table-visible';
import {
  SLOT_TABLE_PAGE_SIZE,
  pageGroupedRenderOrder,
  pageIndexForRowId,
  readSlotTablePageSize,
  type SlotTablePageSize,
} from '@/lib/tables/slot-table-page';
import { slotTableFindHighlightId } from '@/lib/tables/slot-table-find';
import { flattenRenderOrder, type RowGroup } from '@/lib/group-rows';
import { ordersCompoundView } from '@/lib/orders/orders-compound-view';
import { ordersNextStep } from '@/lib/orders/orders-next-step';
import { resolveOrdersHoldValue, resolveOrdersSlotValue } from '@/lib/tables/field-catalog/orders-resolve';
import { useOrderChannel } from '@/hooks/useCatalog';
import { orderAdminUrl } from '@/utils/order-platform';
import { orderRowQtyTone } from '@/lib/condition-tone';
import { customerFullName, customerPlace } from '@/lib/customers/customer-display';
import { linePrice } from '@/lib/orders/order-card-model';
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
  RECORD_OPEN_CLASS,
} from '@/design-system/tokens/industrial-record';
import { RecordNoteSlot } from '@/design-system/components/RecordNoteSlot';
import { LifecycleCode } from '@/design-system/components/record-ledger/LifecycleCode';
import { useViewDensity } from './useViewDensity';
import { VIEW_SORT_ARRANGE } from './view-sort';
import { OutboundOrdersLedgerToolbar } from './OutboundOrdersLedgerToolbar';
import { Popover, PopoverContent, PopoverTrigger } from '@/design-system/primitives/radix-popover';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
import { OrderRecordTitle, OrderRecordView } from './OrderRecordView';
import { OrderRecordHeaderActions } from './record-keys/OrderRecordHeaderActions';
import { OrderRecordActionStrip, OrdersMorphingHost } from './to-ship/MorphingRowActionMenu';
import { OrderQueueSummary, OrderQueueSummaryLine } from './OrderQueueSummary';
import { LedgerPhotoViewer } from './outbound-orders-ledger-photos';
import { linePhotoLabel } from '@/lib/photos/line-photos';
import { initials, recordState, worstState } from './outbound-orders-ledger-state';
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
  LEDGER_PHOTO_CLASS,
  LEDGER_PHOTO_LANE_CLASS,
  LEDGER_ROW_CLASS,
  LEDGER_ROW_PX,
  LEDGER_SPINE_CLASS,
  LEDGER_SPINE_HATCH_CLASS,
  LEDGER_NESTED_HIT_CLASS,
  LEDGER_ORDER_NUMBER_SLOT_CLASS,
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
  /** The list view this ledger is — its spec decides the row facts, sort, empty state and the open record's sections. */
  viewKey: OrderListViewKey;
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
  viewKey,
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
  const viewSpec = VIEW_SPECS[viewKey];
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
    arrangeGroups: VIEW_SORT_ARRANGE[viewSpec.sort],
  });
  const { plane, orderGroupsByDate, displayedRecords, painted } = feed;
  const { density: zoom } = useViewDensity(viewKey);
  // One note overlay across the whole ledger: opening a row's note closes any other.
  const [noteOpenId, setNoteOpenId] = useState<number | null>(null);
  const openNote = useCallback((orderId: number) => setNoteOpenId(orderId), []);
  const closeNote = useCallback((orderId: number) => {
    setNoteOpenId((current) => (current === orderId ? null : current));
  }, []);
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
  // The plane owns the check-set; reading it back off the selection bus lost
  // every emit (the listener re-subscribed in the same commit it fired).
  const selectedCount = plane.selectedIds.size;

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
  const openRow = plane.openRecord;
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

  const openOrderRef = openRecord ? String(openRecord.order_id ?? '').trim() || String(openRecord.id) : '';

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 bg-mode-canvas text-mode-ink"
      style={LEDGER_DENSITY_STYLE}
    >
    <DeskRecordPlane
      open={openRecord != null}
      onClose={plane.closeRecord}
      title={openRecord ? <OrderRecordTitle record={openRecord} records={displayedRecords} /> : 'Order'}
      actions={openRecord ? <OrderRecordHeaderActions record={openRecord} records={displayedRecords} /> : undefined}
      indexLabel={cursor.available && cursor.position != null ? `${cursor.position} of ${cursor.total}` : undefined}
      recordNoun="order"
      recordKey={openId != null ? String(openId) : null}
      summary={<OrderQueueSummary records={displayedRecords} />}
      testId="order-record"
      list={
    <div data-testid="pending-grid-body" className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* ── The list anchor: the table toolbar + the open record's action strip.
          Table-level controls only (operator 2026-09-26): search, sort, filters,
          views and category are view-level and live in the contextual sidebar. ── */}
      <div {...{ [DESK_RECORD_ANCHOR_ATTR]: '' }} className="flex min-w-0 shrink-0 flex-col">
      <OutboundOrdersLedgerToolbar
        viewKey={viewKey}
        selectedCount={selectedCount}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
      />
      {/* Checked rows own the verbs (the check-set bar, the index face's
          header bulk bar); otherwise the open record's strip. */}
      {selectedCount > 0 ? (
        <OrdersMorphingHost
          placement="header"
          records={displayedRecords}
          selectedIds={plane.selectedIds}
          viewKey={viewKey}
        />
      ) : openRecord ? (
        <OrderRecordActionStrip
          key={openRecord.id}
          record={openRecord}
          viewKey={viewKey}
          checked={plane.selectedIds.has(Number(openRecord.id))}
          onToggleSelect={plane.handleToggleSelect}
          onOpenLabels={onOpenLabels}
        />
      ) : null}
      </div>

      {banner}

      {/* ── Records ────────────────────────────────────────────────────────── */}
      <div className="relative isolate flex min-h-0 min-w-0 flex-1 flex-col">
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          {items.length === 0 ? (
            loading || searchPending ? (
              <OrdersLedgerStandIn rows={[]} zoom={zoom} />
            ) : (
              <div className="flex min-h-60 flex-col items-center justify-center gap-2 border-b border-mode-divide text-center">
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
                    <b className="text-role-body font-bold text-mode-ink">{viewSpec.empty.title}</b>
                    <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>{viewSpec.empty.detail}</span>
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
                        viewKey={viewKey}
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
                        viewKey={viewKey}
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
        // In place the queue summary rides the list's foot; split / floor, the empty pane or rail shows it.
        lead={deskRecordBesideList(recordView) ? undefined : <OrderQueueSummaryLine records={displayedRecords} />}
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
          viewKey={viewKey}
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
      staffId: fieldId === 'orders.picked' ? staff.pickerId : staff.packerId,
      display: fieldId === 'orders.picked' ? staff.pickerDisplay : staff.packerDisplay,
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
  viewKey,
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
  viewKey: OrderListViewKey;
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
  const inState = group.rows.filter((row) => recordState(row) === state).length;
  // Band face = the org's dense short label (`AMZRN`); the full name rides the
  // tooltip and the order-number menu.
  const channel = useOrderChannel()(orderId, lead.account_source);
  const meta = channel.meta;
  const spec = LIFECYCLE[state];
  // The order's next step is its worst line's: that line is what holds it.
  const worst = group.rows.find((row) => recordState(row) === state) ?? lead;
  const next = ordersNextStep(worst);
  const pick = groupStage(group.rows, 'orders.picked', getStaffName);
  const pack = groupStage(group.rows, 'orders.packed', getStaffName);
  const shows = new Set<OrdersFactId>(rowFactsAt(viewKey, zoom));
  // A view whose primary verb is Resolve works line by line; the order band carries no next step.
  const paintsNextStep = VIEW_SPECS[viewKey].verbs.primary !== 'resolve';

  return (
    <div
      data-order-group-key={group.key}
      className={cn(
        'relative flex border-b border-mode-divide bg-mode-bar',
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
          'ds-raw-button inline-flex shrink-0 items-center justify-center border-r border-mode-seam text-mode-muted hover:bg-mode-hover',
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
            className="w-11 shrink-0"
            srLabel={`${spec.label}: ${inState} of ${group.rows.length} lines`}
          />
          <RecordNoteSlot note={String(lead.buyer_note ?? lead.notes ?? '').trim() || null} />
          <RecordPlatformFace channel={channel} />
          <span
            className={cn(RECORD_ID_CLASS, LEDGER_NESTED_HIT_CLASS, LEDGER_ORDER_NUMBER_SLOT_CLASS)}
            onClick={stop}
            onPointerDown={stop}
          >
            <OrderNumberMenuChip
              value={orderId}
              platformLabel={meta.value ? meta.label : null}
              openHref={orderAdminUrl(orderId, lead.account_source, lead.admin_url)}
              face="full"
              plain
              dense
            />
          </span>
        </span>
        {/* The buyer, on the records' buyer column — the same face every
            single record wears (owner 2026-09-27: no bin / box / line counts
            on the order band; the lines below carry them). */}
        <span className="flex min-w-0 flex-1 items-center overflow-hidden">
          <LedgerCustomerFace customer={lead.customer ?? null} />
        </span>
        {shows.has('orders.picked') ? (
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
        ) : null}
        {shows.has('orders.packed') ? (
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
        ) : null}
        {paintsNextStep ? <LedgerNextStep next={next} /> : null}
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
        'flex h-full w-32 shrink-0 items-center border-l border-mode-seam px-2',
        next?.blocked ? STATE_TONE_CLASSES.danger.text : 'text-mode-ink',
      )}
    >
      {next?.label ?? ''}
    </span>
  );
}

/** The Exceptions row's primary verb: open the record, whose main column leads with the pairing form. */
function LedgerResolve({ onResolve }: { onResolve: () => void }) {
  return (
    <button
      type="button"
      data-testid="ledger-resolve"
      onClick={(event) => {
        event.stopPropagation();
        onResolve();
      }}
      onPointerDown={stop}
      className={cn(
        'ds-raw-button pointer-events-auto flex h-full w-32 shrink-0 items-center border-l border-mode-seam px-2 text-mode-ink hover:bg-mode-hover',
        RECORD_LABEL_CLASS,
        focusRing('cell'),
      )}
    >
      → Resolve
    </button>
  );
}

/** Why the order is held (`orders.hold_reason`) — the lead cell of a held row. */
function LedgerHoldReason({ record }: { record: ShippedOrder }) {
  const value = resolveOrdersHoldValue(record, 'orders.hold_reason');
  if (value?.kind !== 'hold-reason') return null;
  return (
    <span
      data-testid="ledger-hold-reason"
      title={`${value.category} · ${value.owner}`}
      className={cn(RECORD_LABEL_CLASS, 'flex h-full min-w-0 items-center truncate px-2 text-mode-warn')}
    >
      {value.category}
    </span>
  );
}

/** What is missing and the one action that releases it (`orders.hold_fix`). */
function LedgerHoldFix({ record, className }: { record: ShippedOrder; className?: string }) {
  const value = resolveOrdersHoldValue(record, 'orders.hold_fix');
  if (value?.kind !== 'hold-fix') return null;
  const missing = value.missing.join(' · ');
  return (
    <span
      data-testid="ledger-hold-fix"
      title={[missing, value.action].filter(Boolean).join(' — ')}
      className={cn('flex min-w-0 items-baseline gap-2 overflow-hidden', className)}
    >
      {missing ? <span className="min-w-0 truncate text-role-data text-mode-ink">{missing}</span> : null}
      <span className={cn(RECORD_LABEL_CLASS, 'min-w-0 shrink-[2] truncate text-mode-muted')}>{value.action}</span>
    </span>
  );
}

/** How many held orders the one fix releases (`orders.hold_releases`). */
function LedgerHoldReleases({ record }: { record: ShippedOrder }) {
  const value = resolveOrdersHoldValue(record, 'orders.hold_releases');
  if (value?.kind !== 'hold-releases') return null;
  return (
    <span
      data-testid="ledger-hold-releases"
      className={cn(RECORD_LABEL_CLASS, 'w-32 shrink-0 truncate', value.count > 1 ? 'text-mode-ink' : 'text-mode-muted')}
    >
      <span className={RECORD_FACT_KEY_CLASS}>Releases </span>
      {value.face}
    </span>
  );
}

/** The buyer's name + place, from the customer book (`/api/orders` joins it). */
function LedgerCustomerFace({ customer }: { customer: ShippedOrder['customer'] | null }) {
  const name = customer ? customerFullName(customer) : '';
  const where = customer ? customerPlace(customer) : '';
  if (!name && !where) return null;
  return (
    <span data-testid="ledger-customer" className="flex min-w-0 items-baseline gap-2" title={[name, where].filter(Boolean).join(' · ')}>
      <span className="truncate text-role-data text-mode-ink">{name}</span>
      {where ? <span className={cn(RECORD_LABEL_CLASS, 'min-w-0 shrink-[4] truncate text-mode-muted')}>{where}</span> : null}
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
              open && RECORD_OPEN_CLASS,
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
  viewKey: OrderListViewKey;
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
  onRowAction: (record: ShippedOrder, event?: QueueRowClickEvent) => void;
  onToggleSelect: (record: ShippedOrder, event: { shiftKey: boolean }) => void;
  commits: OrdersQueueCommits;
}

const LedgerRecord = memo(function LedgerRecord({
  viewKey,
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
      selectedStaffId={staff.pickerId}
      assignedName={staff.pickerDisplay}
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
      className={cn(RECORD_ID_CLASS, LEDGER_NESTED_HIT_CLASS, LEDGER_ORDER_NUMBER_SLOT_CLASS)}
      onClick={stop}
      onPointerDown={stop}
    >
      <OrderNumberMenuChip
        value={orderId}
        platformLabel={meta.value ? meta.label : null}
        openHref={orderAdminUrl(orderId, view.platformValue, record.admin_url)}
        face="full"
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
  const customerFace = <LedgerCustomerFace customer={record.customer ?? null} />;

  // The view spec picks the facts; the bands below only place them.
  const viewSpec = VIEW_SPECS[viewKey];
  const shows = new Set<OrdersFactId>(rowFactsAt(viewKey, zoom));
  const price = shows.has('orders.amount') ? <LedgerPrice record={record} /> : null;
  const leadCells: Partial<Record<OrdersFactId, ReactNode>> = {
    'orders.fulfill_by': shipBy,
    'orders.hold_reason': <LedgerHoldReason record={record} />,
  };
  const leadCell = leadCells[viewSpec.lead] ?? null;
  const primaryCell =
    viewSpec.verbs.primary === 'resolve' ? <LedgerResolve onResolve={() => onRowAction(record)} /> : <LedgerNextStep next={next} />;

  return (
    <div
      data-order-row-id={record.id}
      data-desk-record-key={record.id}
      data-state={state}
      className={cn(
        'group/record relative flex border-b border-mode-divide bg-mode-panel hover:bg-mode-hover hover:z-dropdown focus-within:z-dropdown',
        LEDGER_ROW_CLASS[zoom],
        (open || checked) && RECORD_OPEN_CLASS,
      )}
    >
      {/* The row's open target: */}
      <button
        type="button"
        data-ledger-open=""
        aria-label={`Order ${orderId || record.id}, ${spec.label}, ${record.product_title || 'item'}`}
        aria-current={open || undefined}
        onClick={(event) =>
          onRowAction(record, {
            shiftKey: event.shiftKey,
            metaKey: event.metaKey,
            ctrlKey: event.ctrlKey,
            detail: event.detail,
            target: event.target,
          })
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
          'ds-raw-button relative z-10 shrink-0 cursor-zoom-in overflow-hidden border-r border-mode-seam bg-mode-well',
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
          {shows.has('orders.condition') ? <span className="pointer-events-auto w-20 shrink-0">{condition}</span> : null}
          {code}
          {noteSlot}
          {price}
          <span className="pointer-events-auto">{orderChip}</span>
          <span className={cn(RECORD_TITLE_CLASS, 'flex-1')}>{view.title || '—'}</span>
          {shows.has('orders.qty') ? (
            <span className={cn(RECORD_LABEL_CLASS, 'w-14 shrink-0 text-right', orderRowQtyTone(qtyFace))}>
              Qty {qtyFace}
            </span>
          ) : null}
          <span className="pointer-events-auto w-28 shrink-0">{leadCell}</span>
          {shows.has('orders.hold_fix') ? <LedgerHoldFix record={record} className="w-56 shrink-0" /> : null}
          {shows.has('orders.hold_releases') ? <LedgerHoldReleases record={record} /> : null}
          {shows.has('orders.picked') ? <span className="pointer-events-auto w-32 shrink-0">{pick}</span> : null}
          {shows.has('orders.packed') ? <span className="pointer-events-auto w-32 shrink-0">{pack}</span> : null}
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
            <span className="flex min-w-0 flex-1 items-center">{shows.has('orders.customer') ? customerFace : null}</span>
            {shows.has('orders.item_number') ? (
              <span className="pointer-events-auto h-full shrink-0">
                <LedgerListingLink href={view.titleHref ?? null} itemNumber={record.item_number ?? null} />
              </span>
            ) : null}
            <span className="cf-section-rule pointer-events-auto h-full w-32 shrink-0 border-l border-mode-seam">{leadCell}</span>
          </div>
          {/* Band 2 — identity: what it is ··· how many (the labour multiplier). */}
          <div className={cn('flex min-w-0 items-center gap-3 border-b border-mode-rule pl-2', LEDGER_BAND_CLASS[zoom])}>
            <span className={cn(RECORD_TITLE_CLASS, 'flex-1')} title={view.title || undefined}>
              {view.title || '—'}
            </span>
            {shows.has('orders.qty') ? (
              <span className="cf-section-rule pointer-events-auto h-full w-32 shrink-0 border-l border-mode-seam">
                <LedgerQty
                  value={qtyFace}
                  onCommit={(value) => commits.handleCommitSubtitleField(record, 'orders.qty', value)}
                />
              </span>
            ) : null}
          </div>
          {/*
           * Band 3 — execution: condition (the grade the hand checks) · price.
           * No bin or SKU on the row (owner 2026-09-28: simpler; the open
           * record carries them).
           */}
          <div className={cn('flex min-w-0 items-center gap-3', LEDGER_BAND_CLASS[zoom])}>
            <span className={cn(LEDGER_LEAD_CLASS, 'pl-2')}>
              {shows.has('orders.condition') ? <span className="pointer-events-auto w-20 shrink-0">{condition}</span> : null}
              {/* A held row's execution lead is its fix. */}
              {shows.has('orders.hold_fix') ? <LedgerHoldFix record={record} className="flex-1" /> : null}
            </span>
            {price}
            <span className="min-w-0 flex-1" aria-hidden />
            {shows.has('orders.hold_releases') ? <LedgerHoldReleases record={record} /> : null}
            {shows.has('orders.picked') ? <span className="pointer-events-auto w-32 shrink-0">{pick}</span> : null}
            {shows.has('orders.packed') ? <span className="pointer-events-auto w-32 shrink-0">{pack}</span> : null}
            {primaryCell}
          </div>
        </div>
      )}
    </div>
  );
});

/** The line's price (`orders.amount`, the cards' `linePrice`), or a dash when the channel sent none. */
function LedgerPrice({ record }: { record: ShippedOrder }) {
  const { text, estimate } = linePrice(record);
  return (
    <span
      className={cn(RECORD_ID_CLASS, 'w-24 shrink-0 tabular-nums text-mode-ink')}
      title={estimate ? 'Estimate from the listing price' : undefined}
    >
      {text ?? '—'}
    </span>
  );
}
