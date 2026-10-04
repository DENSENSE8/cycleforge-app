'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DataTableFilterMenu,
  DataTableSortMenu,
  type DataTableFilterChrome,
  type DataTableSortOption,
} from '@/components/tables/DataTable';
import { TriageCardList, type TriageFeed, type TriageRecordSlot, type TriageServerPages } from '@/design-system/components/triage-card-list/TriageCardList';
import { triageFamily } from '@/design-system/components/triage-card-list/triage-view';
import { TriageAllClear } from '@/design-system/components/triage-card-list/TriageListBody';
import { useTriageCut, type TriageCut } from '@/design-system/components/triage-card-list/triage-list-state';
import { RecordLedgerSummaryPane } from '@/design-system/components/record-ledger/RecordLedgerSummary';
import { useReceivingSelectionPort } from '@/components/receiving/use-receiving-selection-port';
import { ReceivingSelectionVerbs } from '@/components/receiving/ReceivingSelectionVerbs';
import { INCOMING_PIPELINE_VIEW } from '@/lib/triage/views';
import { IncomingDeliveryCard } from './cards/IncomingDeliveryCard';
import { IncomingDeliveryRow } from './cards/IncomingDeliveryRow';
import { useTriageDensity } from '@/design-system/components/triage-card-list/triage-density';
import { receiptCardKey, receiptCardModel, type ReceiptCardModel } from './cards/receipt-card-model';
import { IncomingStatusChips, type IncomingStatusChipSet } from './IncomingStatusChips';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { IncomingGridColumnKey } from '@/lib/receiving/receiving-grid-layout';
import type { RowGroup } from '@/lib/group-rows';
import { usePublishRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { useInboundDeliveryRecord } from '@/components/receiving/record/useInboundRecord';
import { useRecordSlot } from '@/design-system/components/record-ledger/useRecordSlot';
import { incomingDeliverySummary, purchaseDeliveryState, purchaseIdentity } from './incoming-delivery-state';

const receivingLineId = (row: ReceivingLineRow): number => row.id;
const purchaseKey = (row: ReceivingLineRow): string =>
  (row.zoho_purchaseorder_id || row.zoho_purchaseorder_number || row.source_order_id || '').trim();

const VIEW = INCOMING_PIPELINE_VIEW;
/** Inbound's status chips are its own (`IncomingStatusChips`, server buckets) — the face's cut filters none. */
const NO_FACE_CHIPS: readonly never[] = [];
const noFaceChipsOf = (): readonly never[] => NO_FACE_CHIPS;
/** A Find naming exactly one PO (or its full tracking number) opens it. */
const receiptExactFind = (query: string, card: ReceiptCardModel) =>
  card.identity.toLowerCase() === query || card.rows.some((row) => (row.tracking_number ?? '').toLowerCase() === query);

const SORT_OPTIONS: readonly DataTableSortOption[] = [
  { id: 'order', label: 'Purchase order', group: 'Record' },
  { id: 'title', label: 'Product title', group: 'Record' },
  { id: 'date', label: 'Expected date', group: 'Delivery' },
  { id: 'age', label: 'Age', group: 'Delivery' },
  { id: 'status', label: 'Delivery state', group: 'Delivery' },
  { id: 'tracking', label: 'Tracking', group: 'Delivery' },
  { id: 'qty', label: 'Quantity', group: 'Item' },
  { id: 'condition', label: 'Condition', group: 'Item' },
  { id: 'platform', label: 'Source', group: 'Purchase' },
  { id: 'zoho', label: 'Zoho status', group: 'Purchase' },
];

interface IncomingDeliveriesLedgerProps {
  groups: readonly [string, RowGroup<ReceivingLineRow>[]][];
  rows: readonly ReceivingLineRow[];
  loading: boolean;
  emptyMessage: string;
  /** The page's Find text (sidebar or global header) — the cards face reads it. */
  findValue: string;
  filter: DataTableFilterChrome;
  /**
   * The contextual sidebar owns Source and Sort (`/incoming`): the toolbar
   * drops its Filter funnel and Sort icon. The Unbox embed has no sidebar.
   */
  sidebarOwnsControls: boolean;
  /** Status chips top-left (delivery state, or the pasted list's buckets). */
  statusChips?: IncomingStatusChipSet | null;
  /** One line above the list (e.g. the pasted list hit the row cap). */
  notice?: string | null;
  /** Which Inbound lane the rows are — the summary pane reads it. */
  lane?: 'pipeline' | 'exceptions';
  /** `groups` bands are urgency sections (`cutIncomingSections`) — the cards head each one. */
  sectioned?: boolean;
  sort: IncomingGridColumnKey | null;
  sortDir: 'asc' | 'desc' | null;
  onSort: (key: IncomingGridColumnKey) => void;
  selectedId: number | null;
  selectedIds: Set<number>;
  onOpenRow: (row: ReceivingLineRow) => void;
  onCloseRow: () => void;
  onToggleRow: (row: ReceivingLineRow) => void;
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}

export function IncomingDeliveriesLedger({
  groups,
  rows,
  loading,
  emptyMessage,
  findValue,
  filter,
  sidebarOwnsControls,
  statusChips,
  notice,
  lane = 'pipeline',
  sectioned = false,
  sort,
  sortDir,
  onSort,
  selectedId,
  selectedIds,
  onOpenRow,
  onCloseRow,
  onToggleRow,
  page,
  pageSize,
  total,
  onPage,
}: IncomingDeliveriesLedgerProps) {
  // The open line follows `selectedId` (the host's `?openLine=`): a deep
  // link, back / forward, a reload — once the line is loaded.
  const [openId, setOpenId] = useState<number | null>(null);
  useEffect(() => {
    if (selectedId == null) setOpenId(null);
    else if (rows.some((row) => row.id === selectedId)) setOpenId(selectedId);
  }, [rows, selectedId]);
  const openRow = useMemo(() => (openId == null ? null : (rows.find((row) => row.id === openId) ?? null)), [openId, rows]);
  useEffect(() => {
    if (openId != null && !openRow) {
      setOpenId(null);
      onCloseRow();
    }
  }, [onCloseRow, openId, openRow]);
  // Every loaded line of the open purchase — the record's items and status.
  const openLines = useMemo(() => {
    if (!openRow) return [];
    const key = purchaseKey(openRow);
    return key ? rows.filter((row) => purchaseKey(row) === key) : [openRow];
  }, [openRow, rows]);

  const open = useCallback((row: ReceivingLineRow) => {
    setOpenId(row.id);
    onOpenRow(row);
  }, [onOpenRow]);

  const close = useCallback(() => {
    setOpenId(null);
    onCloseRow();
  }, [onCloseRow]);

  // The triage face's cut (new deliveries held behind the pill) — applied
  // BEFORE the record cursor, so J / K walk exactly the cards on screen.
  const cut = useTriageCut({ statusKeys: NO_FACE_CHIPS, recordParams: VIEW.recordParams });
  const { filterBands } = cut;
  const cardBands = useMemo(() => filterBands(groups, receiptCardKey, noFaceChipsOf), [filterBands, groups]);

  usePublishRecordCursor({
    surfaceId: 'incoming-deliveries-ledger',
    scope: 'record',
    enabled: true,
    order: cardBands,
    openId: openRow?.id ?? null,
    getId: receivingLineId,
    onOpen: open,
    onClose: close,
  });

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const summary = useMemo(() => incomingDeliverySummary(rows, lane), [lane, rows]);

  const inbound = useInboundDeliveryRecord({ row: openRow, lines: openLines, onRemoved: close });
  const slot = useRecordSlot(inbound?.model ?? null, inbound?.verbs ?? [], openRow ? `PO ${purchaseIdentity(openRow)} actions` : 'Delivery actions', 'inbound-record');
  // Off the desk (the Unbox embed) this row owns Source and Sort only. Find is
  // the page header's URL-bound field.
  const controls = sidebarOwnsControls ? null : (
    <div className="flex shrink-0 items-center gap-2 border-b border-border-soft px-3 py-1">
      <span className="flex-1" />
      <DataTableFilterMenu {...filter} />
      <DataTableSortMenu
        options={SORT_OPTIONS}
        active={sort}
        hot={sort != null}
        activeFace={sort && sortDir ? { label: `${sort} · ${sortDir}` } : undefined}
        onSelect={(id) => onSort(id as IncomingGridColumnKey)}
      />
    </div>
  );

  return (
    <div data-testid="incoming-deliveries-ledger" data-face="cards" className="flex min-h-0 min-w-0 flex-1 flex-col">
      {controls}
      <div className="flex min-h-0 min-w-0 flex-1">
        <IncomingDeliveryCards
          cut={cut}
          bands={cardBands}
          allBands={groups}
          rows={rows}
          loading={loading}
          sectioned={sectioned}
          lane={lane}
          emptyMessage={emptyMessage}
          findValue={findValue}
          openRowId={openRow?.id ?? null}
          onOpen={open}
          onClose={close}
          selectedIds={selectedIds}
          onToggleRow={onToggleRow}
          serverPages={{ page, pageCount, pageSize, onPage }}
          total={total}
          statusChips={statusChips ? <IncomingStatusChips set={statusChips} /> : null}
          notice={notice ?? null}
          record={{
            title: slot?.title ?? 'Delivery',
            actions: slot?.actions,
            noun: VIEW.noun.one,
            showIndex: false,
            testId: 'incoming-deliveries-ledger-record',
            summary: <RecordLedgerSummaryPane summary={summary} />,
            view: slot?.view ?? null,
            strip: null,
          }}
        />
      </div>
    </div>
  );
}

/**
 * The Inbound cards face: the shared {@link TriageCardList} fed by the
 * receiving family — the same face, bar, keys and record plane as To ship,
 * over this host's rows, selection, open record and server pages.
 */
function IncomingDeliveryCards({
  cut,
  bands,
  allBands,
  rows,
  loading,
  sectioned,
  lane,
  emptyMessage,
  findValue,
  openRowId,
  onOpen,
  onClose,
  selectedIds,
  onToggleRow,
  serverPages,
  total,
  statusChips,
  notice,
  record,
}: {
  cut: TriageCut<never>;
  bands: readonly [string, RowGroup<ReceivingLineRow>[]][];
  allBands: readonly [string, RowGroup<ReceivingLineRow>[]][];
  rows: readonly ReceivingLineRow[];
  loading: boolean;
  sectioned: boolean;
  lane: 'pipeline' | 'exceptions';
  emptyMessage: string;
  findValue: string;
  openRowId: number | null;
  onOpen: (row: ReceivingLineRow) => void;
  onClose: () => void;
  selectedIds: Set<number>;
  onToggleRow: (row: ReceivingLineRow) => void;
  serverPages: TriageServerPages;
  total: number;
  statusChips: ReactNode;
  notice: string | null;
  record: TriageRecordSlot;
}) {
  const [density, setDensity] = useTriageDensity('incoming.pipeline');
  const family = useMemo(() => {
    const base = triageFamily(VIEW, {
      rowId: receivingLineId,
      groupKey: receiptCardKey,
      cardModel: receiptCardModel,
      state: (group) => purchaseDeliveryState(group.rows),
      exactFind: receiptExactFind,
      renderCard: (props) => (density === 'row' ? <IncomingDeliveryRow {...props} /> : <IncomingDeliveryCard {...props} />),
    });
    // The Exceptions lane wears this view until it is a nav view of its own.
    return lane === 'exceptions' ? { ...base, listLabel: 'Deliveries that need a person' } : base;
  }, [lane, density]);

  const selection = useReceivingSelectionPort(selectedIds, onToggleRow, rows);

  const painted = useMemo(() => bands.flatMap(([, groups]) => groups.flatMap((group) => group.rows)), [bands]);
  const feed: TriageFeed<ReceivingLineRow> = {
    bands,
    allBands,
    painted,
    sectioned,
    total,
    loading,
    fetching: loading,
    serverPages,
    search: { value: findValue, pending: false },
    selection,
    open: { id: openRowId, open: onOpen, close: onClose },
  };

  return (
    <TriageCardList
      sections="by-state"
      family={family}
      feed={feed}
      cut={cut}
      record={record}
      densityControl={{ value: density, onChange: setDensity }}
      summary={statusChips}
      bulk={<ReceivingSelectionVerbs noun="deliveries" />}
      banner={
        notice ? (
          <p role="status" data-testid="incoming-notice" className="px-4 pb-1 text-xs font-semibold text-text-warning">
            {notice}
          </p>
        ) : null
      }
      searchEmpty={null}
      allClear={
        <TriageAllClear title={emptyMessage} detail={lane === 'exceptions' ? 'Nothing needs a person.' : 'Nothing on the way.'} />
      }
    />
  );
}
