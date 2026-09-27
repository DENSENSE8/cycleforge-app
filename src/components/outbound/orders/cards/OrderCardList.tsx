'use client';

/**
 * Outbound › To ship — the TRIAGE order list: one card per order at a fixed,
 * centred measure (owner 2026-09-27, BRIEF §13). Replaces the DataTable index
 * face; floor keeps the industrial ledger (`OutboundOrdersLedger`).
 *
 * Same feed, selection plane and record plane as the floor ledger
 * (`useOrdersQueueFeed`, `DeskRecordPlane`): a card click opens the record in
 * place (2/3 · 1/3) or in the split pane. Selection:
 * - one checked card → its actions drop down from the card's right edge;
 * - two or more → the bar above the list becomes the bulk bar.
 * No column header — views, filters and search live in the sidebar.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { X } from '@/components/Icons';
import { DataTableSortMenu } from '@/components/tables/DataTable';
import { DataTableFullscreenToggle } from '@/components/tables/DataTableFullscreenToggle';
import { TableStatusBar } from '@/components/tables/TableStatusBar';
import { OrderSearchEmptyState } from '@/components/dashboard/OrderSearchEmptyState';
import { useOrdersQueueFeed, queueRowStaff, type OrdersQueueCommits } from '@/components/dashboard/orders-queue/useOrdersQueueFeed';
import type { QueueRowRecord } from '@/components/dashboard/orders-queue/helpers';
import type { ToShipChrome } from '@/components/unshipped/useToShipChrome';
import { DESK_RECORD_ANCHOR_ATTR, DeskRecordPlane, useDeskRecordView } from '@/design-system/components/DeskRecordPlane';
import { useDeskStageOptional } from '@/design-system/components/DeskStageContext';
import { useRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { useRecordCursorKeyboard } from '@/hooks/useRecordCursorKeyboard';
import { emitSelectionTotal, emitToggleAll } from '@/lib/selection/table-selection';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import { clearSlotTableVisibleIds, publishSlotTableVisibleIds } from '@/lib/tables/slot-table-visible';
import {
  SLOT_TABLE_PAGE_SIZE,
  pageGroupedRenderOrder,
  pageIndexForRowId,
  readSlotTablePageSize,
  type SlotTablePageSize,
} from '@/lib/tables/slot-table-page';
import { slotTableFindHighlightId } from '@/lib/tables/slot-table-find';
import { flattenRenderOrder } from '@/lib/group-rows';
import { orderCardModel } from '@/lib/orders/order-card-model';
import type { OrderRecordMode } from '@/lib/selection-context/order-inspector-context';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { OrderRecordView } from '../OrderRecordView';
import { OrderRecordActionStrip, OrdersMorphingHost } from '../to-ship/MorphingRowActionMenu';
import {
  OrderQueueSummary,
  OrderQueueSummaryChips,
  queueRowStatusKeys,
  type QueueStatusKey,
} from '../OrderQueueSummary';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { OrderCard } from './OrderCard';

const SPRING = { type: 'spring', stiffness: 480, damping: 36, mass: 0.8 } as const;

interface OrderCardListProps {
  mode: OrderRecordMode;
  chrome: ToShipChrome;
  /** The queue fetch for the CURRENT find text is still running. */
  searchPending: boolean;
  records: ShippedOrder[];
  loading: boolean;
  onOpenRecord: (record: ShippedOrder) => void;
  onCloseRecord: () => void;
  railSelection: boolean;
  onLoadMore?: () => void;
  /** Non-blocking band above the cards (refresh failed while cards are painted). */
  banner?: ReactNode;
  searchEmptyTitle: string;
  searchResultLabel: string;
  clearSearchLabel: string;
  onOpenLabels?: (record: ShippedOrder) => void;
}

export function OrderCardList({
  mode,
  chrome,
  searchPending,
  records,
  loading,
  onOpenRecord,
  onCloseRecord,
  railSelection,
  onLoadMore,
  banner,
  searchEmptyTitle,
  searchResultLabel,
  clearSearchLabel,
  onOpenLabels,
}: OrderCardListProps) {
  const searchValue = chrome.search.value;
  const feed = useOrdersQueueFeed({
    records,
    searchValue,
    // `/api/orders?q=` ran the match over the whole scope; `records` ARE the hits.
    searchAnsweredBy: 'server',
    onOpenRecord,
    onCloseRecord,
    selectionScope: DASHBOARD_ORDERS_SELECTION_SCOPE,
    railSelection,
    queueMode: 'fulfillment',
    tableId: 'orders',
    surfaceId: 'pending-grid-body',
  });
  const { plane, orderGroupsByDate, displayedRecords, painted, todayKey, getStaffName } = feed;

  // J / K walk the records. On a desk stage Esc belongs to the record plane and
  // the stage (record → floor → split); off it (station embeds) the hook closes.
  const onDeskStage = useDeskStageOptional() != null;
  useRecordCursorKeyboard({ enabled: true, scope: 'record', escape: !onDeskStage });
  const cursor = useRecordCursor('record');
  const recordView = useDeskRecordView();

  // ── Status filters (the chips above the cards) ────────────────────────────
  // Client-side over the painted queue: a card stays when ANY of its lines
  // answers to ANY active status. Counts read the whole queue, never the cut.
  const [statusFilter, setStatusFilter] = useState<ReadonlySet<QueueStatusKey>>(() => new Set());
  const toggleStatus = useCallback((key: QueueStatusKey) => {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const resetStatus = useCallback(() => setStatusFilter(new Set()), []);
  // The chips count ORDERS (cards) over the whole queue, never the filtered cut.
  const queueOrders = useMemo(
    () => orderGroupsByDate.flatMap(([, groups]) => groups.map((group) => group.rows)),
    [orderGroupsByDate],
  );
  const filteredGroupsByDate = useMemo(
    () =>
      statusFilter.size === 0
        ? orderGroupsByDate
        : orderGroupsByDate
            .map(([day, groups]) => [
              day,
              groups.filter((group) =>
                group.rows.some((row) => queueRowStatusKeys(row, todayKey).some((key) => statusFilter.has(key))),
              ),
            ] as typeof orderGroupsByDate[number])
            .filter(([, groups]) => groups.length > 0),
    [orderGroupsByDate, statusFilter, todayKey],
  );
  // Esc resets the filters — last on the ladder: an overlay, a text field, a
  // check-set and an open record all take Esc first (they preventDefault).
  const filterActiveRef = useRef(false);
  filterActiveRef.current = statusFilter.size > 0;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || !filterActiveRef.current) return;
      if (hasOpenOverlay() || isEditableKeyTarget(event.target)) return;
      event.preventDefault();
      resetStatus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [resetStatus]);

  // ── Page (the slot table's page model + persisted size) ───────────────────
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState<SlotTablePageSize>(SLOT_TABLE_PAGE_SIZE);
  useEffect(() => {
    setPageSize(readSlotTablePageSize());
  }, []);
  useEffect(() => {
    setPageIndex(0);
  }, [searchValue, pageSize, statusFilter]);
  const paged = useMemo(
    () => pageGroupedRenderOrder(filteredGroupsByDate, pageIndex, pageSize),
    [filteredGroupsByDate, pageIndex, pageSize],
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
    : slotTableFindHighlightId({ query: searchValue, paintedRowIds: painted.map((row) => String(row.id)) });
  const getRowKey = useCallback((r: ShippedOrder) => String(r.id), []);
  useEffect(() => {
    if (!scrollToKey) return;
    const next = pageIndexForRowId(filteredGroupsByDate, pageSize, scrollToKey, getRowKey);
    if (next != null && next !== pageIndex) setPageIndex(next);
  }, [scrollToKey, getRowKey, filteredGroupsByDate, pageIndex, pageSize]);

  // ── Cards ─────────────────────────────────────────────────────────────────
  // A group key is the order number, and the same number can head two groups
  // (seen on the seed data) — the lead line's id keeps the card key unique.
  const cards = useMemo(
    () =>
      paged.order.flatMap(([, groups]) =>
        groups.map((group) => orderCardModel(`${group.key}#${group.rows[0]?.id ?? ''}`, group.rows, todayKey)),
      ),
    [paged.order, todayKey],
  );
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const toggleExpand = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // ── Selection ─────────────────────────────────────────────────────────────
  const selectedCount = plane.selectedIds.size;
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => plane.selectedIds.has(id));
  const clearSelection = useCallback(() => emitToggleAll(DASHBOARD_ORDERS_SELECTION_SCOPE, 'none'), []);

  // The record reads the LIVE row (optimistic edits land there).
  const openId = plane.selectedRecord ? Number(plane.selectedRecord.id) : null;
  const openRecord = useMemo(
    () => (openId == null ? null : (displayedRecords.find((r) => Number(r.id) === openId) ?? plane.selectedRecord)),
    [openId, displayedRecords, plane.selectedRecord],
  );
  // In place, an open record covers the cards — no card menu floats over it.
  const cardsCovered = openRecord != null && recordView !== 'split';

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

  const isNarrowed = Boolean(searchValue.trim()) || chrome.filter.options.some((o) => o.active);
  const openRef = openRecord ? String(openRecord.order_id ?? '').trim() || `#${openRecord.id}` : '';

  // ── Scroll edges ──────────────────────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [moreBelow, setMoreBelow] = useState(false);
  const measureEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setMoreBelow(el.scrollTop + el.clientHeight < el.scrollHeight - 2);
  }, []);
  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    const observer = new ResizeObserver(measureEdges);
    observer.observe(el);
    observer.observe(content);
    measureEdges();
    return () => observer.disconnect();
  }, [measureEdges]);
  const list = (
    <div data-testid="pending-grid-body" className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* The list anchor: the select / bulk bar and, with a record open, its action strip. */}
      <div {...{ [DESK_RECORD_ANCHOR_ATTR]: '' }} className="shrink-0 pt-3">
        {/* Reading one order hides the list's controls (owner 2026-09-27). No
            width of its own: the desk stage (DESK_STAGE_FIXED_CLASS) is the one
            width wrapper, so the bar, the cards and the page title share edges. */}
        {openRecord ? null : (
          <div>
            <SelectBar
              selectedCount={selectedCount}
              allSelected={allSelected}
              total={paged.total}
              summary={
                <OrderQueueSummaryChips
                  orders={queueOrders}
                  todayKey={todayKey}
                  active={statusFilter}
                  onToggle={toggleStatus}
                  onReset={resetStatus}
                />
              }
              sortMenu={feed.sortMenu}
              onToggleAll={() => emitToggleAll(DASHBOARD_ORDERS_SELECTION_SCOPE, allSelected ? 'none' : 'all')}
              onClear={clearSelection}
              bulk={
                <OrdersMorphingHost placement="header" records={displayedRecords} selectedIds={plane.selectedIds} mode={mode} />
              }
            />
          </div>
        )}
        {openRecord && selectedCount === 0 ? (
          <div className="pt-2">
            <OrderRecordActionStrip
              key={openRecord.id}
              record={openRecord}
              mode={mode}
              checked={false}
              onToggleSelect={plane.handleToggleSelect}
              onOpenLabels={onOpenLabels}
            />
          </div>
        ) : null}
      </div>

      {banner}

      <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={measureEdges}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
      >
        <div ref={contentRef} className="pb-6 pt-1">
          {cards.length === 0 ? (
            loading || searchPending ? (
              <CardSkeletons />
            ) : statusFilter.size > 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={SPRING}
                className="flex min-h-60 flex-col items-center justify-center gap-3 text-center"
              >
                <p className="text-sm text-text-muted">No orders match these statuses.</p>
                <button
                  type="button"
                  onClick={resetStatus}
                  className={cn('rounded-full bg-text-default px-3 py-1.5 text-xs font-semibold text-surface-card', focusRing('control'))}
                >
                  Reset filters
                </button>
              </motion.div>
            ) : isNarrowed ? (
              <div className="flex min-h-60 items-center justify-center">
                <OrderSearchEmptyState
                  query={searchValue}
                  title={searchEmptyTitle}
                  resultLabel={searchResultLabel}
                  clearLabel={clearSearchLabel}
                  onClear={() => chrome.search.onChange('')}
                />
              </div>
            ) : (
              <QueueClear />
            )
          ) : (
            <ul role="list" aria-label="Orders to ship" aria-busy={loading || searchPending} className="flex flex-col">
              <AnimatePresence initial={false}>
                {cards.map((card, index) => {
                  const checkedCount = card.ids.filter((id) => plane.selectedIds.has(id)).length;
                  const checked = checkedCount === 0 ? false : checkedCount === card.ids.length ? true : 'mixed';
                  const r = card.lead as QueueRowRecord;
                  const staff = queueRowStaff(r, getStaffName);
                  return (
                    <motion.li
                      key={card.key}
                      exit={{ opacity: 0, height: 0, transition: { duration: 0.22 } }}
                      className="relative [&+&]:before:absolute [&+&]:before:inset-x-4 [&+&]:before:top-0 [&+&]:before:h-px [&+&]:before:bg-border-hairline"
                    >
                      <OrderCard
                        model={card}
                        checked={checked}
                        open={openId != null && card.ids.includes(openId)}
                        expanded={expanded.has(card.key)}
                        menuOpen={!cardsCovered && selectedCount === 1 && checked === true}
                        enterIndex={index}
                        mode={mode}
                        packer={{
                          id: staff.packerId,
                          name: staff.packerId != null ? staff.packerDisplay : null,
                          colorHex: (r.packer_color_hex as string | null | undefined) ?? null,
                        }}
                        onRowAction={plane.handleRowAction}
                        onToggleSelect={plane.handleToggleSelect}
                        onToggleGroup={plane.handleToggleGroup}
                        onToggleExpand={toggleExpand}
                        onMenuDone={clearSelection}
                        onOpenLabels={onOpenLabels}
                      />
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </div>
      {/* The page's bottom edge: a soft shadow while more cards sit below the fold. */}
      <motion.div
        aria-hidden
        data-testid="order-card-scroll-shadow"
        data-visible={moreBelow ? '' : undefined}
        initial={false}
        animate={{ opacity: moreBelow ? 1 : 0 }}
        transition={{ duration: 0.25 }}
        className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/[0.11] via-black/[0.04] to-transparent"
      />
      </div>

      {/* Counts live in the bar above the cards; the foot is only the pager. */}
      {paged.pageCount > 1 || onLoadMore ? (
        <TableStatusBar
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
      ) : null}
    </div>
  );

  // Station embeds (pack, shipping) open their own record surface.
  if (!onDeskStage) return list;

  return (
    <DeskRecordPlane
      open={openRecord != null}
      onClose={plane.closeRecord}
      title={openRecord ? `Order ${openRef}` : 'Order'}
      subtitle={openRecord?.product_title?.trim() || undefined}
      indexLabel={cursor.available && cursor.position != null ? `${cursor.position} of ${cursor.total}` : undefined}
      recordNoun="order"
      recordKey={openId != null ? String(openId) : null}
      summary={<OrderQueueSummary records={displayedRecords} todayKey={todayKey} />}
      testId="order-record"
      list={list}
    >
      {openRecord ? (
        <OrderRecordView
          mode={mode}
          record={openRecord}
          records={displayedRecords}
          todayKey={todayKey}
          getStaffName={getStaffName}
          commits={commits}
        />
      ) : null}
    </DeskRecordPlane>
  );
}

// ── Select / bulk bar ─────────────────────────────────────────────────────────

function SelectBar({
  selectedCount,
  allSelected,
  total,
  sortMenu,
  summary,
  onToggleAll,
  onClear,
  bulk,
}: {
  selectedCount: number;
  allSelected: boolean;
  /** Orders in the list (after status filters) — the number beside select-all. */
  total: number;
  sortMenu: ComponentProps<typeof DataTableSortMenu>;
  /** Status filter chips (out of stock, urgent, ready, packed, late, no bin) with their counts. */
  summary: ReactNode;
  onToggleAll: () => void;
  onClear: () => void;
  /** The check-set's verbs (two or more checked). */
  bulk: ReactNode;
}) {
  const active = selectedCount > 0;
  const bulkMode = selectedCount > 1;
  // Mobile first: on a narrow bar (phone, the split's list) the chips / bulk
  // verbs take their own full-width row under the controls and scroll
  // sideways; from @3xl they sit inline between the count and the controls.
  const middleClass = 'order-last flex min-w-0 basis-full items-center @3xl:order-none @3xl:flex-1 @3xl:basis-auto';
  return (
    <div className="@container">
    <motion.div
      layout
      transition={SPRING}
      data-testid="order-card-select-bar"
      className={cn(
        // pl-4 + a 28px box column = the cards' check axis; gap-x-3 = the cards' ml-3.
        'flex min-h-11 min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl py-1.5 pl-4 pr-1.5 transition-[background-color,box-shadow] duration-200',
        active ? 'bg-surface-card shadow-elev-raised ring-1 ring-border-soft' : 'bg-transparent',
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={allSelected ? true : active ? 'mixed' : false}
        aria-label={allSelected ? 'Clear selection' : 'Select all orders on this page'}
        data-testid="order-card-select-all"
        onClick={onToggleAll}
        className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg', focusRing('control'))}
      >
        <span
          className={cn(
            'flex size-[18px] items-center justify-center rounded-[5px] border transition-colors',
            active ? 'border-text-default bg-text-default text-surface-card' : 'border-border-strong bg-surface-card hover:border-text-muted',
          )}
        >
          {active ? (
            <svg viewBox="0 0 16 16" className="size-3" fill="none" aria-hidden>
              <path
                d={allSelected ? 'M3.5 8.5l3 3 6-7' : 'M4 8h8'}
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : null}
        </span>
      </button>

      <AnimatePresence mode="popLayout" initial={false}>
        {active ? (
          <motion.span
            key="selected"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={SPRING}
            className="flex shrink-0 items-center gap-1 text-sm font-semibold text-text-default"
          >
            <motion.span key={selectedCount} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={SPRING} className="tabular-nums">
              {selectedCount}
            </motion.span>
            selected
          </motion.span>
        ) : (
          <motion.span
            key="count"
            data-testid="order-card-count"
            aria-label={`${total} order${total === 1 ? '' : 's'}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={SPRING}
            className="shrink-0 text-sm font-semibold tabular-nums text-text-default"
          >
            <motion.span key={total} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={SPRING} className="inline-block">
              {total}
            </motion.span>
          </motion.span>
        )}
      </AnimatePresence>

      <div className={cn(middleClass, active && !bulkMode && 'hidden')}>
        <AnimatePresence mode="popLayout" initial={false}>
          {bulkMode ? (
            <motion.div
              key="bulk"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={SPRING}
              className="flex min-w-0 flex-1 items-center"
            >
              {bulk}
            </motion.div>
          ) : active ? null : (
            <motion.div
              key="summary"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={SPRING}
              className="flex min-w-0 flex-1 items-center"
            >
              {summary}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {active ? (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear selection"
          data-testid="order-card-clear"
          className={cn('ml-auto flex size-8 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-surface-sunken hover:text-text-default @3xl:ml-0', focusRing('control'))}
        >
          <X className="size-4" />
        </button>
      ) : (
        <span className="ml-auto flex shrink-0 items-center gap-1 @3xl:ml-0">
          <DataTableSortMenu {...sortMenu} />
          <DataTableFullscreenToggle />
        </span>
      )}
    </motion.div>
    </div>
  );
}

// ── Empty + loading ───────────────────────────────────────────────────────────

function QueueClear() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={SPRING}
      className="flex min-h-72 flex-col items-center justify-center gap-2 text-center"
    >
      <motion.span
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 14, delay: 0.1 }}
        className="flex size-12 items-center justify-center rounded-full bg-surface-success text-text-success"
      >
        <svg viewBox="0 0 24 24" className="size-6" fill="none" aria-hidden>
          <motion.path
            d="M5 12.5l4.5 4.5L19 7.5"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.45, delay: 0.3 }}
          />
        </svg>
      </motion.span>
      <p className="text-base font-semibold text-text-default">No orders to ship</p>
      <p className="text-sm text-text-muted">Queue clear.</p>
    </motion.div>
  );
}

function CardSkeletons() {
  return (
    <ul aria-hidden className="flex flex-col">
      {Array.from({ length: 8 }, (_, i) => (
        <li key={i} className="flex gap-3 rounded-2xl px-4 py-3">
          <span className="w-7 shrink-0 space-y-3 pt-0.5">
            <span className="block size-[18px] animate-pulse rounded-[5px] bg-surface-sunken" />
            <span className="block size-4 animate-pulse rounded-md bg-surface-sunken" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-2.5">
            <span className="flex justify-between">
              <span className="h-3.5 w-56 animate-pulse rounded-md bg-surface-sunken" />
              <span className="h-3.5 w-20 animate-pulse rounded-md bg-surface-sunken" />
            </span>
            <span className="flex gap-3">
              <span className="size-12 shrink-0 animate-pulse rounded-xl bg-surface-sunken" />
              <span className="flex flex-1 flex-col gap-2 pt-1">
                <span className="h-4 w-3/4 animate-pulse rounded-md bg-surface-sunken" style={{ animationDelay: `${i * 60}ms` }} />
                <span className="h-3 w-1/2 animate-pulse rounded-md bg-surface-sunken" style={{ animationDelay: `${i * 60 + 30}ms` }} />
              </span>
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
