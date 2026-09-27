'use client';

/**
 * Outbound › To ship — the TRIAGE order list: one card per order inside the
 * desk stage's width (owner 2026-09-27, BRIEF §13). Replaces the DataTable
 * index face; floor keeps the industrial ledger (`OutboundOrdersLedger`).
 *
 * Same feed, selection plane and record plane as the floor ledger
 * (`useOrdersQueueFeed`, `DeskRecordPlane`): a card click opens the record in
 * place (2/3 · 1/3) or in the split pane. Selection: one checked card → its
 * actions drop down from the card's right edge; two or more → the bar above
 * the list becomes the bulk bar.
 *
 * Minimal click to visibility:
 * - status chips filter (URL `?cardStatus=`), J / K walk only what is shown;
 * - pager top right (URL `?page=`), `[` `]` Home End, or Scroll mode;
 * - ship-by sections (Late · Due today · Tomorrow · Later · No ship-by) under
 *   the default sort — the feed re-cuts its bands so pages and J / K follow them;
 * - a Find that types an exact order number opens that order;
 * - Space = quick look; "SKU in N orders" checks the batch;
 * - new orders wait behind a pill instead of shoving the cards;
 * - the scroll place survives a record, a view switch and a reload.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { ArrowUp } from '@/components/Icons';
import { OrderSearchEmptyState } from '@/components/dashboard/OrderSearchEmptyState';
import { useOrdersQueueFeed, queueRowStaff, type OrdersQueueCommits } from '@/components/dashboard/orders-queue/useOrdersQueueFeed';
import type { QueueRowRecord } from '@/components/dashboard/orders-queue/helpers';
import type { QueueRowClickEvent } from '@/components/dashboard/orders-queue/queue-row-click';
import type { ToShipChrome } from '@/components/unshipped/useToShipChrome';
import { DESK_RECORD_ANCHOR_ATTR, DeskRecordPlane, useDeskRecordView } from '@/design-system/components/DeskRecordPlane';
import { useDeskStageOptional } from '@/design-system/components/DeskStageContext';
import { useRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { useRecordCursorKeyboard } from '@/hooks/useRecordCursorKeyboard';
import { emitSelectionTotal, emitToggleAll } from '@/lib/selection/table-selection';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import { clearSlotTableVisibleIds, publishSlotTableVisibleIds } from '@/lib/tables/slot-table-visible';
import { pageGroupedRenderOrder, pageIndexForRowId } from '@/lib/tables/slot-table-page';
import { slotTableFindHighlightId } from '@/lib/tables/slot-table-find';
import { flattenRenderOrder, type RowGroup } from '@/lib/group-rows';
import { ORDER_SLA_SECTIONS, orderCardModel, orderSla, type OrderCardSlaTone } from '@/lib/orders/order-card-model';
import type { OrderRecordMode } from '@/lib/selection-context/order-inspector-context';
import { useSidebarColumnOpen } from '@/lib/nav/sidebar-column-store';
import { QUEUE_CARRIER_SORT_GROUP, QUEUE_CHANNEL_SORT_GROUP } from '@/utils/queue-display-sort';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { getCurrentPSTDateKey } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { OrderRecordView } from '../OrderRecordView';
import { OrderRecordActionStrip, OrdersMorphingHost } from '../to-ship/MorphingRowActionMenu';
import { OrderQueueSummary, OrderQueueSummaryChips, queueRowStatusKeys } from '../OrderQueueSummary';
import { OrderCard } from './OrderCard';
import { OrderCardSelectBar, type SelectBarPager } from './OrderCardSelectBar';
import {
  useCardListPageKeys,
  useCardListPageMode,
  useCardListUrlState,
  useHeldNewOrders,
  useKeptScroll,
} from './order-card-list-state';

const SPRING = { type: 'spring', stiffness: 480, damping: 36, mass: 0.8 } as const;

/** Scroll mode reads every loaded card as one page. */
const ALL_LOADED = Number.MAX_SAFE_INTEGER;

/** Ship-by section headers under the default (deadline) sort. */
const SLA_SECTION: Readonly<Record<OrderCardSlaTone, string>> = {
  late: 'Late',
  today: 'Due today',
  soon: 'Tomorrow',
  later: 'Later',
  none: 'No ship-by',
};

/** A card's key: the order number can head two groups, the lead line's id keeps it unique. */
function cardKeyOf(group: RowGroup<ShippedOrder>): string {
  return `${group.key}#${group.rows[0]?.id ?? ''}`;
}

interface OrderCardListProps {
  mode: OrderRecordMode;
  chrome: ToShipChrome;
  /** The queue fetch for the CURRENT find text is still running. */
  searchPending: boolean;
  /** Any queue fetch is in flight (a "Load more" included) — next page waits for it. */
  fetching: boolean;
  records: ShippedOrder[];
  loading: boolean;
  onOpenRecord: (record: ShippedOrder) => void;
  onCloseRecord: () => void;
  railSelection: boolean;
  onLoadMore?: () => void;
  /** Lines in the whole queue scope on the server — more than `records` while pages remain. */
  queueTotal?: number;
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
  fetching,
  records,
  loading,
  onOpenRecord,
  onCloseRecord,
  railSelection,
  onLoadMore,
  queueTotal,
  banner,
  searchEmptyTitle,
  searchResultLabel,
  clearSearchLabel,
  onOpenLabels,
}: OrderCardListProps) {
  const searchValue = chrome.search.value;
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // ── Status filter + held new orders + ship-by sections → the feed's cut ───
  // The feed arranges BEFORE the record cursor, so J / K walk the screen's
  // order and never step onto a card the chips (or the new-orders hold) hide.
  const url = useCardListUrlState();
  const { statusFilter } = url;
  const [heldKeys, setHeldKeys] = useState<ReadonlySet<string>>(() => new Set());
  const arrangeGroups = useCallback(
    (bands: [string, RowGroup<ShippedOrder>[]][], sort: string): [string, RowGroup<ShippedOrder>[]][] => {
      const todayKey = getCurrentPSTDateKey();
      const keep = (group: RowGroup<ShippedOrder>) =>
        !heldKeys.has(cardKeyOf(group)) &&
        (statusFilter.size === 0 ||
          group.rows.some((row) => queueRowStatusKeys(row, todayKey).some((key) => statusFilter.has(key))));
      if (sort !== 'deadline') {
        return bands
          .map(([band, groups]) => [band, groups.filter(keep)] as [string, RowGroup<ShippedOrder>[]])
          .filter(([, groups]) => groups.length > 0);
      }
      // The feed bands by DAY (no-ship-by orders by their created day), which
      // interleaves "No ship-by" with "Late". Re-band by SLA tone, keeping the
      // feed's order inside each section.
      const byTone = new Map<OrderCardSlaTone, RowGroup<ShippedOrder>[]>();
      for (const [, groups] of bands) {
        for (const group of groups) {
          if (!keep(group)) continue;
          const tone = orderSla(group.rows, todayKey).tone;
          const section = byTone.get(tone);
          if (section) section.push(group);
          else byTone.set(tone, [group]);
        }
      }
      return ORDER_SLA_SECTIONS.flatMap((tone) => {
        const groups = byTone.get(tone);
        return groups ? [[tone, groups] as [string, RowGroup<ShippedOrder>[]]] : [];
      });
    },
    [statusFilter, heldKeys],
  );

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
    arrangeGroups,
  });
  const { plane, orderGroupsByDate, allOrderGroupsByDate, displayedRecords, painted, todayKey, getStaffName } = feed;

  const allCardKeys = useMemo(
    () => allOrderGroupsByDate.flatMap(([, groups]) => groups.map(cardKeyOf)),
    [allOrderGroupsByDate],
  );
  const held = useHeldNewOrders({
    groupKeys: allCardKeys,
    scrollRef,
    // Any change to the question (search, sidebar filters, chips, staff) makes
    // everything it brings "seen" — only arrivals inside one scope are held.
    resetKey: `${searchValue}|${url.scopeKey}`,
  });
  useEffect(() => setHeldKeys(held.held), [held.held]);

  // The chips count ORDERS (cards) over the whole queue, never the filtered cut.
  const queueOrders = useMemo(
    () => allOrderGroupsByDate.flatMap(([, groups]) => groups.map((group) => group.rows)),
    [allOrderGroupsByDate],
  );

  // J / K walk the records. On a desk stage Esc belongs to the record plane and
  // the stage (record → floor → split); off it (station embeds) the hook closes.
  const onDeskStage = useDeskStageOptional() != null;
  useRecordCursorKeyboard({ enabled: true, scope: 'record', escape: !onDeskStage });
  const cursor = useRecordCursor('record');
  const recordView = useDeskRecordView();

  // Esc resets the status chips — last on the ladder: an overlay, a text field,
  // a check-set and an open record all take Esc first. The open record is
  // checked explicitly: this listener mounts before the record's own Esc
  // listener, so with a chip active it used to reset the chips instead of
  // closing the record.
  const filterActiveRef = useRef(false);
  filterActiveRef.current = statusFilter.size > 0;
  const recordOpenRef = useRef(false);
  recordOpenRef.current = plane.selectedRecord != null;
  const resetStatus = url.resetStatus;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || !filterActiveRef.current) return;
      if (recordOpenRef.current || hasOpenOverlay() || isEditableKeyTarget(event.target)) return;
      event.preventDefault();
      resetStatus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [resetStatus]);

  // ── Pages (URL `?page=`) or Scroll ─────────────────────────────────────────
  const { mode: pageMode, setMode: setPageMode, resolved: pageModeResolved } = useCardListPageMode();
  const scrollMode = pageMode === 'scroll';
  const pageSize = scrollMode ? ALL_LOADED : pageMode;
  const paged = useMemo(
    () => pageGroupedRenderOrder(orderGroupsByDate, scrollMode ? 0 : url.pageIndex, pageSize),
    [orderGroupsByDate, scrollMode, url.pageIndex, pageSize],
  );
  // A page past the end (rows left the queue, a smaller page size) clamps —
  // but not while a fetch is in flight (› past the last loaded page steps onto
  // the page the next chunk is about to fill), and not before the remembered
  // page size is read: at the SSR default (100 / page) a reload's `?page=2`
  // looked past the end and was stripped before the real size arrived.
  useEffect(() => {
    if (!pageModeResolved || fetching || scrollMode || loading) return;
    if (url.pageIndex > paged.pageCount - 1) url.setPageIndex(paged.pageCount - 1);
  }, [pageModeResolved, fetching, scrollMode, loading, url, paged.pageCount]);

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

  // The open record (or the find hit) pulls its page on screen.
  const scrollToKey = plane.selectedRecord
    ? String(plane.selectedRecord.id)
    : slotTableFindHighlightId({ query: searchValue, paintedRowIds: painted.map((row) => String(row.id)) });
  const getRowKey = useCallback((r: ShippedOrder) => String(r.id), []);
  useEffect(() => {
    if (!scrollToKey || scrollMode) return;
    const next = pageIndexForRowId(orderGroupsByDate, pageSize, scrollToKey, getRowKey);
    if (next != null && next !== url.pageIndex) url.setPageIndex(next);
  }, [scrollToKey, scrollMode, getRowKey, orderGroupsByDate, url, pageSize]);

  // ── Cards ─────────────────────────────────────────────────────────────────
  const cards = useMemo(
    () => paged.order.flatMap(([, groups]) => groups.map((group) => orderCardModel(cardKeyOf(group), group.rows, todayKey))),
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
  const [peekKey, setPeekKey] = useState<string | null>(null);
  const togglePeek = useCallback((key: string) => setPeekKey((current) => (current === key ? null : key)), []);

  // "SKU in N orders": each SKU → the ids of every loaded order carrying it.
  const skuOrders = useMemo(() => {
    const bySku = new Map<string, { cards: Set<string>; ids: number[] }>();
    for (const [, groups] of allOrderGroupsByDate) {
      for (const group of groups) {
        const key = cardKeyOf(group);
        for (const row of group.rows) {
          const sku = String(row.sku ?? '').trim();
          if (!sku) continue;
          const entry = bySku.get(sku) ?? { cards: new Set(), ids: [] };
          entry.cards.add(key);
          entry.ids.push(...group.rows.map((r) => Number(r.id)));
          bySku.set(sku, entry);
        }
      }
    }
    return bySku;
  }, [allOrderGroupsByDate]);
  const handleToggleGroup = plane.handleToggleGroup;
  const selectSku = useCallback(
    (sku: string) => {
      const entry = skuOrders.get(sku);
      if (entry) handleToggleGroup([...new Set(entry.ids)], true);
    },
    [skuOrders, handleToggleGroup],
  );

  // ── Selection ─────────────────────────────────────────────────────────────
  const selectedCount = plane.selectedIds.size;
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => plane.selectedIds.has(id));
  const clearSelection = useCallback(() => emitToggleAll(DASHBOARD_ORDERS_SELECTION_SCOPE, 'none'), []);
  // A card body OPENS the order, even with a check-set live — only the
  // checkbox checks (owner 2026-09-27). ⌘ / Ctrl keeps the plane's new-tab
  // gesture. Cards only: the floor ledger keeps its select-mode row law.
  const handleRowAction = plane.handleRowAction;
  const openRow = plane.openRecord;
  const openCard = useCallback(
    (record: ShippedOrder, event?: QueueRowClickEvent) => {
      if (event?.metaKey || event?.ctrlKey) handleRowAction(record, event);
      else openRow(record);
    },
    [handleRowAction, openRow],
  );

  // The record reads the LIVE row (optimistic edits land there).
  const openId = plane.selectedRecord ? Number(plane.selectedRecord.id) : null;
  const openRecord = useMemo(
    () => (openId == null ? null : (displayedRecords.find((r) => Number(r.id) === openId) ?? plane.selectedRecord)),
    [openId, displayedRecords, plane.selectedRecord],
  );
  // In place, an open record covers the cards — no card menu floats over it.
  const cardsCovered = openRecord != null && recordView !== 'split';

  // ── Find an exact order number → open it ──────────────────────────────────
  const jumpedFor = useRef<string | null>(null);
  useEffect(() => {
    const q = searchValue.trim().toLowerCase();
    if (!q) {
      jumpedFor.current = null;
      return;
    }
    if (jumpedFor.current === q || searchPending) return;
    const hits = cards.filter((card) => card.orderId.toLowerCase() === q);
    if (hits.length !== 1) return;
    jumpedFor.current = q;
    if (openId == null || !hits[0]!.ids.includes(openId)) openRow(hits[0]!.lead);
  }, [searchValue, searchPending, cards, openId, openRow]);

  // ── Find (F) ──────────────────────────────────────────────────────────────
  // Sidebar open: the sidebar owns Find (and F); the bar shows none.
  // Sidebar closed: the bar carries its own Find field, and F lands there —
  // claimed in CAPTURE, because the closed column keeps the sidebar's Find
  // mounted and its bubble listener would focus an input nobody can see.
  const sidebarOpen = useSidebarColumnOpen();
  const barFindRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (sidebarOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'f' || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (event.defaultPrevented || hasOpenOverlay() || isEditableKeyTarget(event.target)) return;
      const input = barFindRef.current;
      if (!input) return;
      event.preventDefault();
      input.focus();
      input.select();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [sidebarOpen]);

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

  // ── Scroll: bottom shadow, kept place, Scroll-mode loading ────────────────
  const [moreBelow, setMoreBelow] = useState(false);
  const keepScroll = useKeptScroll(scrollRef, cards.length > 0);
  const measureEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setMoreBelow(el.scrollTop + el.clientHeight < el.scrollHeight - 2);
  }, []);
  const onScroll = useCallback(() => {
    measureEdges();
    keepScroll();
  }, [measureEdges, keepScroll]);
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

  const trustNextBatch = held.trustNextBatch;
  const loadMore = useMemo(
    () =>
      onLoadMore && !fetching
        ? () => {
            trustNextBatch();
            onLoadMore();
          }
        : undefined,
    [onLoadMore, fetching, trustNextBatch],
  );
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    const root = scrollRef.current;
    if (!scrollMode || !el || !root || !loadMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { root, rootMargin: '0px 0px 480px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollMode, loadMore]);

  // ── Count + pager ─────────────────────────────────────────────────────────
  // Unfiltered, the count is the SERVER's scope total; a status filter or a
  // search narrows to what is loaded, so it counts the cut.
  const narrowed = statusFilter.size > 0 || Boolean(searchValue.trim());
  const total = narrowed ? paged.total : Math.max(queueTotal ?? 0, paged.total);
  const lastLoadedPage = paged.pageIndex >= paged.pageCount - 1;
  const firstRow = paged.shown === 0 ? 0 : paged.pageIndex * (scrollMode ? 0 : pageSize) + 1;
  const goPrev = useCallback(() => url.setPageIndex(paged.pageIndex - 1), [url, paged.pageIndex]);
  const goNext = useCallback(() => {
    if (!lastLoadedPage) {
      url.setPageIndex(paged.pageIndex + 1);
      return;
    }
    // Past the last loaded page: read the next chunk, then step onto it. The
    // button is disabled while a fetch is in flight, so fast clicks cannot
    // land on an empty page.
    if (!loadMore) return;
    loadMore();
    url.setPageIndex(paged.pageIndex + 1);
  }, [lastLoadedPage, loadMore, url, paged.pageIndex]);
  const pager: SelectBarPager | null =
    !scrollMode && total > paged.shown
      ? {
          label: `${firstRow}–${firstRow + paged.shown - 1} of ${total}`,
          canPrev: paged.pageIndex > 0,
          canNext: !lastLoadedPage || Boolean(loadMore),
          onPrev: goPrev,
          onNext: goNext,
        }
      : null;
  useCardListPageKeys({
    enabled: !scrollMode && openRecord == null,
    onPrev: () => {
      if (paged.pageIndex > 0) goPrev();
    },
    onNext: () => {
      if (!lastLoadedPage || loadMore) goNext();
    },
    onFirst: () => url.setPageIndex(0),
    onLast: () => url.setPageIndex(paged.pageCount - 1),
  });

  // Ship-by sections — only under the default deadline sort, where the feed
  // bands by SLA tone (`arrangeGroups`). A section counts its whole cut, not
  // just the cards on this page.
  const grouped = feed.sort === 'deadline';
  const sectionCounts = useMemo(() => {
    const counts: Partial<Record<OrderCardSlaTone, number>> = {};
    if (grouped) for (const [tone, groups] of orderGroupsByDate) counts[tone as OrderCardSlaTone] = groups.length;
    return counts;
  }, [grouped, orderGroupsByDate]);

  const cardItems: ReactNode[] = [];
  let lastSection: OrderCardSlaTone | null = null;
  cards.forEach((card, index) => {
    if (grouped && card.sla.tone !== lastSection) {
      lastSection = card.sla.tone;
      cardItems.push(
        <motion.li
          key={`section:${card.sla.tone}`}
          layout="position"
          data-testid="order-card-section"
          className="sticky top-0 z-20 -mx-1 flex items-center gap-2 bg-surface-card/90 px-5 pb-1.5 pt-3 backdrop-blur-sm"
        >
          <span className={cn('text-xs font-semibold', card.sla.tone === 'late' ? 'text-text-danger' : card.sla.tone === 'today' ? 'text-text-warning' : 'text-text-muted')}>
            {SLA_SECTION[card.sla.tone]}
          </span>
          <span className="rounded-full bg-surface-sunken px-1.5 text-[11px] font-semibold tabular-nums text-text-muted">
            {sectionCounts[card.sla.tone]}
          </span>
        </motion.li>,
      );
    }
    const checkedCount = card.ids.filter((id) => plane.selectedIds.has(id)).length;
    const checked = checkedCount === 0 ? false : checkedCount === card.ids.length ? true : 'mixed';
    const r = card.lead as QueueRowRecord;
    const staff = queueRowStaff(r, getStaffName);
    const leadSku = card.lines[0]?.sku;
    cardItems.push(
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
          onOpen={openCard}
          onToggleSelect={plane.handleToggleSelect}
          onToggleGroup={plane.handleToggleGroup}
          onToggleExpand={toggleExpand}
          onMenuDone={clearSelection}
          onOpenLabels={onOpenLabels}
          peekOpen={peekKey === card.key}
          onTogglePeek={togglePeek}
          todayKey={todayKey}
          skuShared={leadSku ? (skuOrders.get(leadSku)?.cards.size ?? 0) : 0}
          onSelectSku={selectSku}
        />
      </motion.li>,
    );
  });

  const list = (
    <div data-testid="pending-grid-body" className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* The list anchor: the select / bulk bar and, with a record open, its action strip. */}
      <div {...{ [DESK_RECORD_ANCHOR_ATTR]: '' }} className="shrink-0 pt-3">
        {/* Reading one order hides the list's controls (owner 2026-09-27). No
            width of its own: the desk stage (DESK_STAGE_FIXED_CLASS) is the one
            width wrapper, so the bar, the cards and the page title share edges. */}
        {openRecord ? null : (
          <OrderCardSelectBar
            selectedCount={selectedCount}
            allSelected={allSelected}
            total={total}
            pager={pager}
            pageMode={pageMode}
            onPageModeChange={setPageMode}
            summary={
              <OrderQueueSummaryChips
                orders={queueOrders}
                todayKey={todayKey}
                active={statusFilter}
                onToggle={url.toggleStatus}
                onReset={resetStatus}
              />
            }
            // Sort only (owner 2026-09-27): the Platform / Carrier pins are
            // filters in disguise and leave this menu; date and column sorts stay.
            sortMenu={{
              ...feed.sortMenu,
              options: feed.sortMenu.options.filter(
                (option) => option.group !== QUEUE_CHANNEL_SORT_GROUP && option.group !== QUEUE_CARRIER_SORT_GROUP,
              ),
            }}
            onToggleAll={() => emitToggleAll(DASHBOARD_ORDERS_SELECTION_SCOPE, allSelected ? 'none' : 'all')}
            onClear={clearSelection}
            bulk={<OrdersMorphingHost placement="header" records={displayedRecords} selectedIds={plane.selectedIds} mode={mode} />}
            find={sidebarOpen ? null : { value: searchValue, onChange: chrome.search.onChange, inputRef: barFindRef }}
          />
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
        {/* New orders wait here instead of shoving the cards down. */}
        <AnimatePresence>
          {held.held.size > 0 ? (
            <motion.button
              key="new-orders"
              type="button"
              data-testid="order-card-new-orders"
              onClick={held.release}
              initial={{ opacity: 0, y: -12, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.9 }}
              transition={SPRING}
              className={cn(
                'absolute left-1/2 top-2 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-text-default px-3 py-1.5 text-xs font-semibold text-surface-card shadow-elev-overlay',
                focusRing('control'),
              )}
            >
              <ArrowUp className="size-3.5" aria-hidden />
              {held.held.size} new order{held.held.size === 1 ? '' : 's'}
            </motion.button>
          ) : null}
        </AnimatePresence>

        <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
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
                <AnimatePresence initial={false}>{cardItems}</AnimatePresence>
              </ul>
            )}

            {/* The end of what is loaded: more on the server. */}
            {cards.length > 0 && lastLoadedPage && onLoadMore ? (
              <div ref={sentinelRef} className="flex justify-center pt-4">
                <button
                  type="button"
                  data-testid="order-card-load-more"
                  disabled={!loadMore}
                  onClick={() => loadMore?.()}
                  className={cn(
                    'rounded-full border border-border-soft bg-surface-card px-4 py-2 text-xs font-medium text-text-default shadow-elev-soft transition-colors hover:border-border-strong disabled:opacity-60',
                    focusRing('control'),
                  )}
                >
                  {fetching ? 'Loading…' : searchValue.trim() ? 'Load more matches' : `Load more · ${paged.total} of ${total} loaded`}
                </button>
              </div>
            ) : null}
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
