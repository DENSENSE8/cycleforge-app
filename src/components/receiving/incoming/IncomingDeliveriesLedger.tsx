'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  DataTableFilterMenu,
  DataTableSortMenu,
  type DataTableFilterChrome,
  type DataTableSortOption,
} from '@/components/tables/DataTable';
import { SearchField, Button } from '@/design-system/primitives';
import { RecordLedger } from '@/design-system/components/record-ledger/RecordLedger';
import { useDeskFloorFace, useDeskStageOptional } from '@/design-system/components/DeskStageContext';
import { TriageCardList, type TriageFeed, type TriageRecordSlot, type TriageServerPages } from '@/design-system/components/triage-card-list/TriageCardList';
import { triageFamily } from '@/design-system/components/triage-card-list/triage-view';
import { TriageAllClear } from '@/design-system/components/triage-card-list/TriageListBody';
import { useTriageCut, type TriageCut } from '@/design-system/components/triage-card-list/triage-list-state';
import { RecordLedgerSummaryPane } from '@/design-system/components/record-ledger/RecordLedgerSummary';
import { useReceivingSelectionPort } from '@/components/receiving/use-receiving-selection-port';
import { ReceivingSelectionVerbs } from '@/components/receiving/ReceivingSelectionVerbs';
import { INCOMING_PIPELINE_VIEW } from '@/lib/triage/views';
import { IncomingDeliveryCard } from './cards/IncomingDeliveryCard';
import { receiptCardKey, receiptCardModel, type ReceiptCardModel } from './cards/receipt-card-model';
import { IncomingStatusChips, type IncomingStatusChipSet } from './IncomingStatusChips';
import { RecordActionStrip } from '@/design-system/components/record-action-strip/RecordActionStrip';
import { useRouter } from 'next/navigation';
import { buildIncomingDeliveryVerbs } from './incoming-record-verbs';
import { RECORD_ID_CLASS } from '@/design-system/tokens/industrial-record';
import { cn } from '@/utils/_cn';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { IncomingGridColumnKey } from '@/lib/receiving/receiving-grid-layout';
import type { RowGroup } from '@/lib/group-rows';
import { foldKey } from '@/lib/group-rows';
import { usePublishRecordCursor, useRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import {
  IncomingDeliveryEvidence,
  incomingDeliverySummary,
  useIncomingDelivery,
} from './IncomingDeliveryEvidence';
import {
  IncomingDeliveryRecord,
  incomingDeliveryRecordState,
  purchaseIdentity,
  type IncomingLedgerEntry,
} from './IncomingDeliveryRecord';

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
  /** The ledger's own search field — omitted on `/incoming`, where the sidebar Find owns search. */
  query?: string;
  onQueryChange?: (value: string) => void;
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
  scrollRef: RefObject<HTMLDivElement>;
}

export function IncomingDeliveriesLedger({
  groups,
  rows,
  loading,
  emptyMessage,
  query,
  onQueryChange,
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
  scrollRef,
}: IncomingDeliveriesLedgerProps) {
  const [folded, setFolded] = useState<Set<string>>(() => new Set());
  const [openKey, setOpenKey] = useState<string | null>(null);

  const entries = useMemo<IncomingLedgerEntry[]>(() => {
    const next: IncomingLedgerEntry[] = [];
    for (const [date, dayGroups] of groups) {
      for (const group of dayGroups) {
        const multi = group.rows.length > 1;
        const groupKey = foldKey(date, group.key);
        if (multi) next.push({ kind: 'group', key: groupKey, group });
        if (!multi || !folded.has(groupKey)) {
          for (const row of group.rows) {
            next.push({
              kind: 'line',
              key: `line:${row.id}`,
              row,
              grouped: multi,
            });
          }
        }
      }
    }
    return next;
  }, [groups, folded]);

  // The open line follows `selectedId` (the host's `?openLine=`) whenever that
  // CHANGES — a deep link, back / forward, a reload — and only then, so a
  // local open or close never races the URL catching up.
  const syncedIdRef = useRef<number | null>(null);
  const openRowIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (selectedId === syncedIdRef.current) return;
    if (selectedId == null) {
      syncedIdRef.current = null;
      setOpenKey(null);
      return;
    }
    if (!rows.some((row) => row.id === selectedId)) return;
    syncedIdRef.current = selectedId;
    if (openRowIdRef.current !== selectedId) setOpenKey(`line:${selectedId}`);
  }, [rows, selectedId]);

  useEffect(() => {
    if (openKey && !entries.some((entry) => entry.key === openKey)) {
      setOpenKey(null);
      onCloseRow();
    }
  }, [entries, onCloseRow, openKey]);

  const openEntry = useMemo(
    () => entries.find((entry) => entry.key === openKey) ?? null,
    [entries, openKey],
  );
  const openRow = openEntry?.kind === 'line'
    ? openEntry.row
    : openEntry?.group.rows[0] ?? null;
  openRowIdRef.current = openRow?.id ?? null;
  // Every loaded line of the open purchase — the record's items and status.
  const openLines = useMemo(() => {
    if (!openRow) return [];
    if (openEntry?.kind === 'group') return openEntry.group.rows;
    const key = purchaseKey(openRow);
    return key ? rows.filter((row) => purchaseKey(row) === key) : [openRow];
  }, [openEntry, openRow, rows]);
  const delivery = useIncomingDelivery(openRow);
  const router = useRouter();

  const handleOpen = useCallback((key: string) => {
    const entry = entries.find((candidate) => candidate.key === key);
    if (!entry) return;
    const row = entry.kind === 'line' ? entry.row : entry.group.rows[0];
    if (!row) return;
    setOpenKey(key);
    onOpenRow(row);
  }, [entries, onOpenRow]);

  const close = useCallback(() => {
    setOpenKey(null);
    onCloseRow();
  }, [onCloseRow]);

  const openCursorRow = useCallback((
    row: ReceivingLineRow,
    context: { revealFoldKey: string | null },
  ) => {
    const revealFoldKey = context.revealFoldKey;
    if (revealFoldKey) {
      setFolded((current) => {
        if (!current.has(revealFoldKey)) return current;
        const next = new Set(current);
        next.delete(revealFoldKey);
        return next;
      });
    }
    setOpenKey(`line:${row.id}`);
    onOpenRow(row);
  }, [onOpenRow]);

  // Two faces over one state (owner 2026-09-27, the To-ship pattern): on a
  // desk stage, In place / Split paint the triage cards and Floor
  // (⌘/Ctrl+Shift+F) the industrial ledger. Off a stage (the Unbox embed) the
  // ledger is the only face.
  const stage = useDeskStageOptional();
  useDeskFloorFace(stage != null);
  const cardsFace = stage != null && stage.view !== 'floor';

  // The triage face's cut (new deliveries held behind the pill) — applied
  // BEFORE the record cursor, so J / K walk exactly the cards on screen.
  const cut = useTriageCut({ statusKeys: NO_FACE_CHIPS, recordParams: VIEW.recordParams });
  const { filterBands } = cut;
  const cardBands = useMemo(() => filterBands(groups, receiptCardKey, noFaceChipsOf), [filterBands, groups]);

  usePublishRecordCursor({
    surfaceId: 'incoming-deliveries-ledger',
    scope: 'record',
    enabled: true,
    order: cardsFace ? cardBands : groups,
    folds: { mode: 'default-expanded', collapsed: folded },
    openId: openRow?.id ?? null,
    getId: receivingLineId,
    onOpen: openCursorRow,
    onClose: close,
  });
  const recordNavigation = useRecordCursor('record');

  const toggleFold = useCallback((key: string) => {
    setFolded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const renderRecord = useCallback(
    (entry: IncomingLedgerEntry, open: boolean) => (
      <IncomingDeliveryRecord
        entry={entry}
        open={open}
        folded={folded.has(entry.key)}
        selectedIds={selectedIds}
        onOpen={handleOpen}
        onToggleFold={toggleFold}
        onToggleRow={onToggleRow}
      />
    ),
    [folded, handleOpen, onToggleRow, selectedIds, toggleFold],
  );

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const shownStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const shownEnd = total === 0 ? 0 : Math.min((page - 1) * pageSize + rows.length, total);

  const summary = useMemo(() => incomingDeliverySummary(rows, lane), [lane, rows]);

  const recordTitle = openRow ? `PO ${purchaseIdentity(openRow)}` : 'Delivery';
  const actionStrip = openRow ? (
    <RecordActionStrip
      key={openKey}
      verbs={buildIncomingDeliveryVerbs({ row: openRow, delivery, navigate: router.push, onRemoved: close })}
      label={`PO ${purchaseIdentity(openRow)} actions`}
      testId="incoming-actions"
    />
  ) : null;
  const record = openRow ? (
    <IncomingDeliveryEvidence
      key={openRow.id}
      row={openRow}
      lines={openLines}
      state={incomingDeliveryRecordState(openRow)}
      delivery={delivery}
    />
  ) : null;
  const tableControls = sidebarOwnsControls ? null : (
    <>
      <DataTableFilterMenu {...filter} />
      <DataTableSortMenu
        options={SORT_OPTIONS}
        active={sort}
        hot={sort != null}
        activeFace={sort && sortDir ? { label: `${sort} · ${sortDir}` } : undefined}
        onSelect={(id) => onSort(id as IncomingGridColumnKey)}
      />
    </>
  );
  const footer = (
    <>
      <span>{shownStart.toLocaleString()}–{shownEnd.toLocaleString()} of {total.toLocaleString()}</span>
      <span className="ml-auto inline-flex items-center gap-1">
        <Button type="button" variant="ghost" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <span className={RECORD_ID_CLASS}>{page} / {pageCount}</span>
        <Button type="button" variant="ghost" size="sm" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>Next</Button>
      </span>
    </>
  );

  if (cardsFace) {
    return (
      <div data-testid="incoming-deliveries-ledger" data-face="cards" className="flex min-h-0 min-w-0 flex-1">
        <IncomingDeliveryCards
          cut={cut}
          bands={cardBands}
          allBands={groups}
          rows={rows}
          entries={entries}
          loading={loading}
          sectioned={sectioned}
          lane={lane}
          emptyMessage={emptyMessage}
          findValue={findValue}
          openRowId={openRow?.id ?? null}
          onOpenKey={handleOpen}
          onClose={close}
          selectedIds={selectedIds}
          onToggleRow={onToggleRow}
          serverPages={{ page, pageCount, pageSize, onPage }}
          total={total}
          statusChips={statusChips ? <IncomingStatusChips set={statusChips} face="cards" /> : null}
          notice={notice ?? null}
          record={{
            title: recordTitle,
            noun: VIEW.noun.one,
            testId: 'incoming-deliveries-ledger-record',
            summary: <RecordLedgerSummaryPane summary={summary} />,
            view: record,
            strip: actionStrip,
          }}
        />
      </div>
    );
  }

  return (
    <RecordLedger
      testId="incoming-deliveries-ledger"
      label="Incoming deliveries"
      records={entries}
      recordKey={(entry) => entry.key}
      renderRecord={renderRecord}
      openKey={openKey}
      onOpenKey={handleOpen}
      onClose={close}
      scrollRef={scrollRef}
      loading={loading}
      navigation={recordNavigation.available ? recordNavigation : undefined}
      banner={
        notice ? (
          <p role="status" data-testid="incoming-notice" className="border-b border-mode-divide bg-mode-bar px-3 py-1 text-role-caption font-semibold text-mode-warn">
            {notice}
          </p>
        ) : undefined
      }
      toolbar={
        <>
          {onQueryChange ? (
            <SearchField
              value={query ?? ''}
              onChange={onQueryChange}
              placeholder="Filter incoming…"
              className="min-w-0 flex-1 overflow-hidden rounded-mode-control pl-2"
              tone="neutral"
              hideUnderline
              fillHost
            />
          ) : null}
          {statusChips ? (
            <span className={cn('flex min-w-0 items-stretch', onQueryChange ? 'shrink' : 'flex-1')}>
              <IncomingStatusChips set={statusChips} face="floor" />
            </span>
          ) : onQueryChange ? null : (
            <span className="flex-1" />
          )}
          {tableControls}
        </>
      }
      empty={<b className="text-role-body font-bold text-mode-ink">{emptyMessage}</b>}
      recordTitle={recordTitle}
      recordNoun="delivery"
      actionStrip={actionStrip}
      summary={summary}
      record={record}
      footer={footer}
    />
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
  entries,
  loading,
  sectioned,
  lane,
  emptyMessage,
  findValue,
  openRowId,
  onOpenKey,
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
  entries: readonly IncomingLedgerEntry[];
  loading: boolean;
  sectioned: boolean;
  lane: 'pipeline' | 'exceptions';
  emptyMessage: string;
  findValue: string;
  openRowId: number | null;
  onOpenKey: (key: string) => void;
  onClose: () => void;
  selectedIds: Set<number>;
  onToggleRow: (row: ReceivingLineRow) => void;
  serverPages: TriageServerPages;
  total: number;
  statusChips: ReactNode;
  notice: string | null;
  record: TriageRecordSlot;
}) {
  const family = useMemo(() => {
    const base = triageFamily(VIEW, {
      rowId: receivingLineId,
      groupKey: receiptCardKey,
      cardModel: receiptCardModel,
      exactFind: receiptExactFind,
      renderCard: (props) => <IncomingDeliveryCard {...props} />,
    });
    // The Exceptions lane wears this view until it is a nav view of its own.
    return lane === 'exceptions' ? { ...base, listLabel: 'Deliveries that need a person' } : base;
  }, [lane]);

  // The ledger's entry keys, so the open delivery survives a switch to Floor:
  // a line opens as its line entry; a folded purchase opens as its group.
  const openRow = useCallback(
    (row: ReceivingLineRow) => {
      const lineKey = `line:${row.id}`;
      if (entries.some((entry) => entry.key === lineKey)) onOpenKey(lineKey);
      else {
        const group = entries.find((entry) => entry.kind === 'group' && entry.group.rows.some((r) => r.id === row.id));
        if (group) onOpenKey(group.key);
      }
    },
    [entries, onOpenKey],
  );

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
    open: { id: openRowId, open: openRow, close: onClose },
  };

  return (
    <TriageCardList
      family={family}
      feed={feed}
      cut={cut}
      record={record}
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
