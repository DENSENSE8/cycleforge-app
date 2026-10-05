'use client';

/**
 * Outbound › To ship / Picking — the ORDERS HOST of the triage face (owner
 * 2026-09-27, BRIEF §13): one card per order inside the desk stage's width, in
 * In place and Split alike (no Floor — owner 2026-09-28).
 *
 * The face ({@link TriageCardList}) owns every interaction — the bar, pages,
 * Scroll mode, held-new, X / Space / Enter, J / K, sections, the record plane.
 * This host owns the orders' data and meaning:
 * - the feed (`useOrdersQueueFeed` over `/api/orders`), its selection plane
 *   and open record;
 * - ship-by sections (Late · Due today · Tomorrow · Later · No ship-by) under
 *   the default sort — re-cut BEFORE the record cursor so J / K follow them;
 * - the order card (`OrderCard`), the notes writer, a Find that types an
 *   exact order number, and the record's Documents request.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { OrderSearchEmptyState } from '@/components/dashboard/OrderSearchEmptyState';
import { useOrdersQueueFeed, type OrdersQueueCommits } from '@/components/dashboard/orders-queue/useOrdersQueueFeed';
import type { ToShipChrome } from '@/components/unshipped/useToShipChrome';
import { useDeskStageOptional } from '@/design-system/components/DeskStageContext';
import type { RecordOpenEvent } from '@/design-system/components/record-card/RecordCard';
import { emitSelectionTotal, emitToggleAll } from '@/lib/selection/table-selection';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import { clearDataTableVisibleIds, publishDataTableVisibleIds } from '@/lib/tables/data-table-visible-rows';
import type { GroupedRenderOrder, RowGroup } from '@/lib/group-rows';
import {
  ORDER_SLA_SECTIONS,
  orderCardModel,
  orderSla,
  type OrderCardModel,
  type OrderCardSlaTone,
} from '@/lib/orders/order-card-model';
import { OUTBOUND_TRIAGE_VIEW } from '@/lib/triage/views';
import { VIEW_SPECS, type OrderListViewKey } from '@/lib/views/view-specs';
import { sortOrderSection } from '@/lib/orders/order-section-sort';
import { getCurrentPSTDateKey } from '@/utils/date';
import { OrderRecordTitle, OrderRecordView } from '../OrderRecordView';
import { OrderRecordHeaderActions } from '../record-keys/OrderRecordHeaderActions';
import { OrderListLeadSlot } from '../intake/order-list-lead';
import { OrderRecordActionStrip, OrdersMorphingHost } from '../to-ship/MorphingRowActionMenu';
import { OrderQueueSummary, queueRowStatusKeys } from '../OrderQueueSummary';
import { QUEUE_STATUS_CHIPS } from '@/lib/orders/to-ship-queue';
import { OrderCard } from './OrderCard';
import { OrderRow } from './OrderRow';
import { TriageCardList, type TriageFeed, type TriageSelectionPort } from '@/design-system/components/triage-card-list/TriageCardList';
import { triageFamily } from '@/design-system/components/triage-card-list/triage-view';
import { TriageAllClear } from '@/design-system/components/triage-card-list/TriageListBody';
import { useTriageCut } from '@/design-system/components/triage-card-list/triage-list-state';
import { useTriageDensity } from '@/design-system/components/triage-card-list/triage-density';

const VIEW = OUTBOUND_TRIAGE_VIEW;
const orderRowId = (row: ShippedOrder) => Number(row.id);
const orderExactFind = (query: string, card: OrderCardModel) => card.orderId.toLowerCase() === query;

/** A card's key: the order number can head two groups, the lead line's id keeps it unique. */
function cardKeyOf(group: RowGroup<ShippedOrder>): string {
  return `${group.key}#${group.rows[0]?.id ?? ''}`;
}

/**
 * The feed bands by DAY (no-ship-by orders by their created day), which
 * interleaves "No ship-by" with "Late". Re-band by SLA tone, then order each
 * section by its deadline (undated: oldest order first).
 */
function bandBySla(bands: GroupedRenderOrder<ShippedOrder>, todayKey: string): [string, RowGroup<ShippedOrder>[]][] {
  const byTone = new Map<OrderCardSlaTone, RowGroup<ShippedOrder>[]>();
  for (const [, groups] of bands) {
    for (const group of groups) {
      const tone = orderSla(group.rows, todayKey).tone;
      const section = byTone.get(tone);
      if (section) section.push(group);
      else byTone.set(tone, [group]);
    }
  }
  return ORDER_SLA_SECTIONS.flatMap((tone) => {
    const groups = byTone.get(tone);
    if (!groups) return [];
    return [[tone, sortOrderSection(groups, tone !== 'none')] as [string, RowGroup<ShippedOrder>[]]];
  });
}

interface OrderCardListProps {
  viewKey: OrderListViewKey;
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
  viewKey,
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
  const viewSpec = VIEW_SPECS[viewKey];

  // ── The face's cut (chips + held new) + ship-by sections → the feed ───────
  // The feed arranges BEFORE the record cursor, so J / K walk the screen's
  // order and never step onto a card the chips (or the new-orders hold) hide.
  const cut = useTriageCut({ statusKeys: QUEUE_STATUS_CHIPS, recordParams: VIEW.recordParams, statusParam: VIEW.chips.param });
  const { filterBands } = cut;
  const arrangeGroups = useCallback(
    (bands: [string, RowGroup<ShippedOrder>[]][], sort: string): [string, RowGroup<ShippedOrder>[]][] => {
      const todayKey = getCurrentPSTDateKey();
      const kept = filterBands(bands, cardKeyOf, queueRowStatusKeys);
      // The list's one sort is the sidebar's `?sort=`; only its default cuts sections.
      return sort === 'deadline' ? bandBySla(kept, todayKey) : kept;
    },
    [filterBands],
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

  // Documents (the bar's verb): the order's label · slip · manuals open in the
  // split pane — the list stays on the left to keep triaging (owner 2026-09-27).
  const stage = useDeskStageOptional();
  // Compact / Full is offered where the view spec allows it (Allocate) and only
  // on the desk stage; Shortage and station embeds keep the card.
  const [chosenDensity, setDensity] = useTriageDensity('outbound.allocate');
  const densityControl =
    viewSpec.faceSwitch && stage != null ? { value: chosenDensity, onChange: setDensity } : undefined;
  const density = densityControl?.value ?? 'card';
  const [documentsRequest, setDocumentsRequest] = useState<{ orderId: number; nonce: number } | null>(null);
  const documentsSeen = useRef(false);
  const setStageView = stage?.setView;
  const openDocuments = useCallback(
    (record: ShippedOrder) => {
      setStageView?.('split');
      documentsSeen.current = false;
      setDocumentsRequest({ orderId: Number(record.id), nonce: Date.now() });
      plane.openRecord(record);
    },
    [setStageView, plane],
  );

  // ── Selection + open ports ────────────────────────────────────────────────
  const selection = useMemo<TriageSelectionPort<ShippedOrder>>(
    () => ({
      ids: plane.selectedIds,
      toggle: plane.handleToggleSelect,
      toggleGroup: plane.handleToggleGroup,
      setAll: (on) => emitToggleAll(DASHBOARD_ORDERS_SELECTION_SCOPE, on ? 'all' : 'none'),
      publishVisible: (ids) => {
        publishDataTableVisibleIds(DASHBOARD_ORDERS_SELECTION_SCOPE, ids);
        emitSelectionTotal(DASHBOARD_ORDERS_SELECTION_SCOPE, ids.length);
        return () => clearDataTableVisibleIds(DASHBOARD_ORDERS_SELECTION_SCOPE);
      },
    }),
    [plane.selectedIds, plane.handleToggleSelect, plane.handleToggleGroup],
  );
  // A card body OPENS the order, even with a check-set live — only the
  // checkbox checks (owner 2026-09-27). ⌘ / Ctrl keeps the plane's new-tab
  // gesture. Cards only: the floor ledger keeps its select-mode row law.
  const handleRowAction = plane.handleRowAction;
  const openRow = plane.openRecord;
  const openCard = useCallback(
    (record: ShippedOrder, event?: RecordOpenEvent) => {
      if (event?.metaKey || event?.ctrlKey) handleRowAction(record, event);
      else openRow(record);
    },
    [handleRowAction, openRow],
  );

  // The record reads the LIVE row (optimistic edits land there).
  const openId = plane.selectedRecord ? Number(plane.selectedRecord.id) : null;
  // A documents request is for ONE opening: once its order has been open, the
  // next record (or closing) spends it, so coming back opens on the details.
  useEffect(() => {
    if (!documentsRequest) return;
    if (openId === documentsRequest.orderId) documentsSeen.current = true;
    else if (documentsSeen.current) {
      documentsSeen.current = false;
      setDocumentsRequest(null);
    }
  }, [openId, documentsRequest]);
  const openRecord = useMemo(
    () => (openId == null ? null : (displayedRecords.find((r) => Number(r.id) === openId) ?? plane.selectedRecord)),
    [openId, displayedRecords, plane.selectedRecord],
  );

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
  // Line 1's note edit → the order's notes trail (the same writer the record uses).
  const saveNote = useCallback(
    (record: ShippedOrder, text: string) => handleCommitSubtitleField(record, 'orders.notes', text),
    [handleCommitSubtitleField],
  );

  // ── The orders family ─────────────────────────────────────────────────────
  const cardModel = useCallback(
    (group: RowGroup<ShippedOrder>) => orderCardModel(cardKeyOf(group), group.rows, todayKey, getStaffName),
    [todayKey, getStaffName],
  );
  const family = useMemo(
    () =>
      triageFamily(VIEW, {
        rowId: orderRowId,
        groupKey: cardKeyOf,
        cardModel,
        exactFind: orderExactFind,
        renderCard: (props) =>
          density === 'row' ? <OrderRow {...props} /> : <OrderCard {...props} todayKey={todayKey} onSaveNote={saveNote} />,
      }),
    [cardModel, todayKey, saveNote, density],
  );

  const triageFeed: TriageFeed<ShippedOrder> = {
    bands: orderGroupsByDate,
    allBands: allOrderGroupsByDate,
    painted,
    sectioned: feed.sort === 'deadline',
    // The feed drops orders a deferred Delete hid; the server's total still counts them.
    total: queueTotal == null ? undefined : queueTotal - (records.length - painted.length),
    loading,
    fetching,
    onLoadMore,
    search: { value: searchValue, pending: searchPending },
    selection,
    open: { id: openId, open: openCard, close: plane.closeRecord },
  };

  const isNarrowed = Boolean(searchValue.trim()) || chrome.filter.options.some((o) => o.active);

  return (
    <TriageCardList
      family={family}
      densityControl={densityControl}
      rowScroll
      feed={triageFeed}
      cut={cut}
      bulk={
        <OrdersMorphingHost
          placement="header"
          verbSet="triage"
          records={displayedRecords}
          selectedIds={plane.selectedIds}
          viewKey={viewKey}
          onOpenDocuments={openDocuments}
        />
      }
      banner={banner}
      leadSlot={<OrderListLeadSlot />}
      searchEmpty={
        isNarrowed ? (
          <OrderSearchEmptyState
            query={searchValue}
            title={searchEmptyTitle}
            resultLabel={searchResultLabel}
            clearLabel={clearSearchLabel}
            onClear={() => chrome.search.onChange('')}
          />
        ) : null
      }
      allClear={<TriageAllClear title={viewSpec.empty.title} detail={viewSpec.empty.detail} />}
      record={{
        title: openRecord ? <OrderRecordTitle record={openRecord} records={displayedRecords} /> : 'Order',
        actions: openRecord ? <OrderRecordHeaderActions record={openRecord} records={displayedRecords} viewKey={viewKey} /> : undefined,
        noun: VIEW.noun.one,
        showIndex: viewSpec.recordPresentation !== 'allocate',
        testId: 'order-record',
        summary: <OrderQueueSummary records={displayedRecords} />,
        view: openRecord ? (
          <OrderRecordView
            viewKey={viewKey}
            record={openRecord}
            records={displayedRecords}
            todayKey={todayKey}
            getStaffName={getStaffName}
            commits={commits}
            documentsRequest={documentsRequest}
          />
        ) : null,
        strip: openRecord && viewSpec.recordPresentation !== 'allocate' ? (
          <OrderRecordActionStrip
            key={openRecord.id}
            record={openRecord}
            viewKey={viewKey}
            checked={false}
            onToggleSelect={plane.handleToggleSelect}
            onOpenLabels={onOpenLabels}
          />
        ) : null,
      }}
    />
  );
}
