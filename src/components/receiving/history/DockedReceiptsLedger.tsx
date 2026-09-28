'use client';

/**
 * Inbound › Unboxed (Docked) — the unboxed-cartons HOST. Two faces over one
 * state (the To-ship pattern): on a desk stage, In place / Split paint the
 * shared triage face ({@link TriageCardList}, one card per carton) and Floor
 * (⌘/Ctrl+Shift+F) the industrial `RecordLedger`. Off a stage (the Unbox
 * History tab) the ledger is the only face.
 *
 * The host owns the data and URL: the loaded rows (up to the history window),
 * Find, the sidebar's Sort and Kind (`?dkind=`), and the attention cut —
 * `?dflag=` (Claim · Short · Unfound, comma-separated), written by the pills
 * on both faces, never a second param. Counts are over the loaded rows, the
 * same rows the list shows (owner 2026-09-28: browser counts).
 */

import { useCallback, useMemo, type ReactNode, type RefObject } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, SearchField } from '@/design-system/primitives';
import { RecordLedger } from '@/design-system/components/record-ledger/RecordLedger';
import { RecordLedgerSummaryPane, type RecordLedgerSummary } from '@/design-system/components/record-ledger/RecordLedgerSummary';
import { RecordActionStrip } from '@/design-system/components/record-action-strip/RecordActionStrip';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { useDeskFloorFace, useDeskStageOptional } from '@/design-system/components/DeskStageContext';
import { TriageCardList, type TriageFeed, type TriageRecordSlot } from '@/design-system/components/triage-card-list/TriageCardList';
import { triageFamily } from '@/design-system/components/triage-card-list/triage-view';
import { TriageAllClear } from '@/design-system/components/triage-card-list/TriageListBody';
import { useTriageCut, type TriageCut } from '@/design-system/components/triage-card-list/triage-list-state';
import type { StateName } from '@/design-system/tokens/lifecycle';
import { CartonRecordView } from '@/components/receiving/history/CartonRecordView';
import { cartonRecordTitle, useCartonRecord } from '@/components/receiving/history/use-carton-record';
import { useCartonVerbs } from '@/components/receiving/history/carton-record-verbs';
import { IncomingStatusChips, type IncomingStatusChipSet } from '@/components/receiving/incoming/IncomingStatusChips';
import { ReceivingSelectionVerbs } from '@/components/receiving/ReceivingSelectionVerbs';
import { useReceivingSelectionPort } from '@/components/receiving/use-receiving-selection-port';
import { receivingLineMatchesQuery } from '@/lib/receiving/receiving-line-search';
import { usePublishRecordCursor, useRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { GroupedRenderOrder } from '@/lib/group-rows';
import { DockedReceivingRecord } from './DockedReceivingRecord';
import { DOCKED_KIND_OPTIONS, DOCKED_STATUS_OPTIONS, dockedCartonStatuses, dockedIntakeKind, type DockedStatus } from '@/lib/receiving/docked-record-state';
import { DOCKED_KIND_PARAM } from '@/lib/receiving/inbound-lane';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import { defaultDirForReceivingGridSort, isReceivingGridSortable, type ReceivingGridColumnKey } from '@/lib/receiving/receiving-grid-layout';
import { compareReceivingGridRows } from '@/lib/receiving/receiving-grid-compare';
import type { ReceivingActivityAxis } from '@/lib/receiving/receiving-stage-stamp';
import { INCOMING_DOCKED_VIEW } from '@/lib/triage/views';
import { CartonCard } from './cards/CartonCard';
import { cartonBands, cartonCardKey, cartonCardModel, groupCartons, type CartonCardModel } from './cards/carton-card-model';

const VIEW = INCOMING_DOCKED_VIEW;

const receivingLineId = (row: ReceivingLineRow): number => row.id;
const SORTS: readonly { key: ReceivingGridColumnKey; label: string }[] = [
  { key: 'date', label: 'Activity date' },
  { key: 'order', label: 'Purchase order' },
  { key: 'title', label: 'Product' },
  { key: 'qty', label: 'Quantity' },
  { key: 'tracking', label: 'Tracking' },
];

/** Every pill the `?dflag=` cut can name, in pill order. */
const FLAG_KEYS: readonly string[] = DOCKED_STATUS_OPTIONS.map((option) => option.value);
const FLAG_LABEL = new Map<string, string>(DOCKED_STATUS_OPTIONS.map((option) => [option.value, option.label] as const));
/** Unfound is stock nobody can sell or pay for yet (red); Claim and Short need a person (amber); Unboxed is the clean case (green). */
const FLAG_TONE: Readonly<Record<string, StateName>> = { UNFOUND: 'danger', CLAIM: 'warning', SHORT: 'warning', UNBOXED: 'success' };
const KIND_VALUES = new Set<string>(DOCKED_KIND_OPTIONS.map((option) => option.value));
/** A Find naming exactly one carton — its PO / order #, carton #, or tracking — opens it. */
const cartonExactFind = (query: string, card: CartonCardModel) =>
  card.identity.toLowerCase() === query ||
  String(card.lead.receiving_id ?? '') === query.replace(/^#/, '') ||
  card.rows.some((row) => (row.tracking_number ?? '').toLowerCase() === query);

export function DockedReceiptsLedger({
  rows,
  loading,
  emptyMessage,
  query,
  onQueryChange,
  activityAxis,
  toolbarExtra,
  sidebarOwnsControls,
  selectedId,
  selectedIds,
  onOpenRow,
  onCloseRow,
  onToggleRow,
  scrollRef,
}: {
  rows: readonly ReceivingLineRow[];
  loading: boolean;
  emptyMessage: string;
  query: string;
  /** Omitted on `/incoming` — the sidebar Find owns search there; `query` still narrows. */
  onQueryChange?: (value: string) => void;
  activityAxis: ReceivingActivityAxis;
  toolbarExtra?: ReactNode;
  /**
   * The contextual sidebar owns Sort (`/incoming`): the toolbar drops its Sort
   * menu. The Unbox History tab has no sidebar.
   */
  sidebarOwnsControls: boolean;
  selectedId: number | null;
  selectedIds: Set<number>;
  onOpenRow: (row: ReceivingLineRow) => void;
  onCloseRow: () => void;
  onToggleRow: (row: ReceivingLineRow) => void;
  scrollRef: RefObject<HTMLDivElement>;
}) {
  // The attention cut lives in `?dflag=` — the pills write it on both faces, a
  // saved view and a reload keep it.
  const cut = useTriageCut({ statusKeys: FLAG_KEYS, recordParams: VIEW.recordParams, statusParam: VIEW.chips.param });
  const { statusFilter, toggleStatus } = cut.url;
  const { sort, dir, toggleColumnSort, clear } = useUrlColumnSort<ReceivingGridColumnKey>({
    isColumn: isReceivingGridSortable,
    defaultDir: defaultDirForReceivingGridSort,
  });
  const kindRaw = useSearchParams().get(DOCKED_KIND_PARAM);
  const kind = kindRaw && KIND_VALUES.has(kindRaw) ? kindRaw : null;
  // Find + Kind + Sort over the loaded history — the pills count this, before their own cut.
  const foundRows = useMemo(() => {
    const result = rows.filter((row) => receivingLineMatchesQuery(row, query) && (!kind || dockedIntakeKind(row) === kind));
    return sort && dir ? result.sort((a, b) => compareReceivingGridRows(a, b, sort, dir, activityAxis)) : result;
  }, [query, kind, rows, sort, dir, activityAxis]);
  // Pills are carton facts: every line answers with its carton's statuses, so
  // the cards and the Floor ledger cut the same cartons.
  const statusOfRow = useMemo(() => {
    const byRow = new Map<number, DockedStatus[]>();
    for (const group of groupCartons(foundRows)) {
      const statuses = dockedCartonStatuses(group.rows);
      for (const row of group.rows) byRow.set(row.id, statuses);
    }
    return (row: ReceivingLineRow): DockedStatus[] => byRow.get(row.id) ?? [];
  }, [foundRows]);
  const visibleRows = useMemo(
    () => (statusFilter.size === 0 ? foundRows : foundRows.filter((row) => statusOfRow(row).some((flag) => statusFilter.has(flag)))),
    [foundRows, statusFilter, statusOfRow],
  );

  // Two faces over one state: cards on a desk stage, the ledger on Floor / off-stage.
  const stage = useDeskStageOptional();
  useDeskFloorFace(stage != null);
  const cardsFace = stage != null && stage.view !== 'floor';

  // Cards: cartons in activity-day sections under the default (activity) sort.
  const sectioned = !sort || sort === 'date';
  const allCartonBands = useMemo(() => cartonBands(foundRows, activityAxis, sectioned), [foundRows, activityAxis, sectioned]);
  const { filterBands } = cut;
  const cardBands = useMemo(() => filterBands(allCartonBands, cartonCardKey, statusOfRow), [filterBands, allCartonBands, statusOfRow]);

  const ledgerOrder = useMemo<GroupedRenderOrder<ReceivingLineRow>>(
    () => [['docked', [{ key: 'docked', rows: visibleRows }]]],
    [visibleRows],
  );
  const cardRows = useMemo(() => cardBands.flatMap(([, groups]) => groups.flatMap((group) => group.rows)), [cardBands]);
  const openRow = useMemo(
    () => (cardsFace ? cardRows : visibleRows).find((row) => row.id === selectedId) ?? null,
    [cardsFace, cardRows, visibleRows, selectedId],
  );

  const open = useCallback((row: ReceivingLineRow) => onOpenRow(row), [onOpenRow]);
  const close = useCallback(() => onCloseRow(), [onCloseRow]);

  usePublishRecordCursor({
    surfaceId: 'incoming-docked-ledger',
    scope: 'record',
    enabled: true,
    order: cardsFace ? cardBands : ledgerOrder,
    openId: openRow?.id ?? null,
    getId: receivingLineId,
    onOpen: open,
    onClose: close,
  });
  const navigation = useRecordCursor('record');
  // The open carton's read — shared by the record view and the strip's verbs.
  const carton = useCartonRecord(openRow);
  const verbs = useCartonVerbs(carton, close);

  // Status pills: cartons per pill over Find + Kind + Sort (never the cut itself).
  const chipSet = useMemo<IncomingStatusChipSet>(() => {
    const counts = new Map<string, number>();
    for (const [, groups] of allCartonBands) {
      for (const group of groups) {
        for (const flag of dockedCartonStatuses(group.rows)) counts.set(flag, (counts.get(flag) ?? 0) + 1);
      }
    }
    return {
      label: 'Status',
      disabledReason: null,
      onToggle: (id) => toggleStatus(id),
      // Fixed pills in a fixed order so the hand learns ⌥1–⌥4; zero reads as "nothing to do".
      chips: FLAG_KEYS.map((id) => ({
        id,
        label: FLAG_LABEL.get(id) ?? id,
        count: loading ? null : (counts.get(id) ?? 0),
        tone: FLAG_TONE[id] ?? 'info',
        active: statusFilter.has(id),
      })),
    };
  }, [allCartonBands, loading, statusFilter, toggleStatus]);

  const recordTitle = openRow ? cartonRecordTitle(openRow) : 'Receipt';
  const actionStrip =
    openRow && carton ? (
      <RecordActionStrip key={carton.receivingId} verbs={verbs} label={`${cartonRecordTitle(openRow)} actions`} testId="carton-actions" />
    ) : null;
  const recordView =
    openRow && carton ? (
      <CartonRecordView key={carton.receivingId} record={carton} openLineId={openRow.id} onClose={close} />
    ) : openRow ? (
      <EvidenceNotice>No carton identity is available for this record.</EvidenceNotice>
    ) : null;
  const summary: RecordLedgerSummary = {
    title: 'Unboxed cartons',
    facts: [{ label: 'Visible records', value: visibleRows.length }],
    note: 'Select a record to inspect its status, items, shipment, photos, and timeline.',
  };
  const narrowed = Boolean(query.trim()) || statusFilter.size > 0;

  const renderRecord = useCallback(
    (row: ReceivingLineRow, isOpen: boolean) => (
      <DockedReceivingRecord
        row={row}
        open={isOpen}
        selected={selectedIds.has(row.id)}
        activityAxis={activityAxis}
        onOpen={open}
        onToggle={onToggleRow}
      />
    ),
    [onToggleRow, open, selectedIds, activityAxis],
  );

  if (cardsFace) {
    return (
      <div data-testid="docked-receipts-ledger" data-face="cards" className="flex min-h-0 min-w-0 flex-1">
        <HistoryCards
          cut={cut}
          bands={cardBands}
          allBands={allCartonBands}
          rows={cardRows}
          loading={loading}
          sectioned={sectioned}
          activityAxis={activityAxis}
          query={query}
          openRowId={openRow?.id ?? null}
          onOpen={open}
          onClose={close}
          selectedIds={selectedIds}
          onToggleRow={onToggleRow}
          chips={<IncomingStatusChips set={chipSet} face="cards" />}
          searchEmpty={
            narrowed ? <p className="text-sm text-text-muted">No matching unboxed cartons.</p> : null
          }
          allClear={<TriageAllClear title={emptyMessage} detail="Nothing unboxed yet." />}
          record={{
            title: recordTitle,
            noun: VIEW.noun.one,
            testId: 'docked-receipts-ledger-record',
            summary: <RecordLedgerSummaryPane summary={summary} />,
            view: recordView,
            strip: actionStrip,
          }}
        />
      </div>
    );
  }

  return (
    <RecordLedger
      testId="docked-receipts-ledger"
      label="Unboxed cartons"
      records={visibleRows}
      recordKey={(row) => String(row.id)}
      renderRecord={renderRecord}
      openKey={openRow ? String(openRow.id) : null}
      onOpenKey={(id) => {
        const row = visibleRows.find((candidate) => String(candidate.id) === id);
        if (row) open(row);
      }}
      onClose={close}
      scrollRef={scrollRef}
      loading={loading}
      navigation={navigation.available ? navigation : undefined}
      toolbar={
        <>
          {onQueryChange ? (
            <SearchField
              value={query}
              onChange={onQueryChange}
              placeholder="Filter unboxed…"
              className="min-w-0 flex-1 overflow-hidden rounded-mode-control pl-2"
              tone="neutral"
              hideUnderline
              fillHost
            />
          ) : null}
          {/* The same state chips as the cards — one cut, one param. */}
          <span className="flex min-w-0 flex-1 items-stretch">
            <IncomingStatusChips set={chipSet} face="floor" />
          </span>
          {sidebarOwnsControls ? null : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  {sort ? `${SORTS.find((option) => option.key === sort)?.label || sort} · ${dir}` : 'Sort'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {SORTS.map((option) => (
                  <DropdownMenuItem key={option.key} onSelect={() => toggleColumnSort(option.key)}>
                    {option.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem onSelect={clear}>Default order</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {toolbarExtra}
        </>
      }
      actionStrip={actionStrip}
      empty={
        <b className="text-role-body font-bold text-mode-ink">
          {narrowed ? 'No matching records in the loaded history.' : emptyMessage}
        </b>
      }
      recordTitle={recordTitle}
      recordSubtitle={openRow ? `Carton ${openRow.receiving_id ?? openRow.id}` : undefined}
      recordNoun="receipt"
      summary={summary}
      record={recordView}
      footer={<span>{visibleRows.length.toLocaleString()} unboxed lines</span>}
    />
  );
}

/** The History cards face: the shared triage face fed by the receiving-history family. */
function HistoryCards({
  cut,
  bands,
  allBands,
  rows,
  loading,
  sectioned,
  activityAxis,
  query,
  openRowId,
  onOpen,
  onClose,
  selectedIds,
  onToggleRow,
  chips,
  searchEmpty,
  allClear,
  record,
}: {
  cut: TriageCut<string>;
  bands: GroupedRenderOrder<ReceivingLineRow>;
  allBands: GroupedRenderOrder<ReceivingLineRow>;
  rows: readonly ReceivingLineRow[];
  loading: boolean;
  sectioned: boolean;
  activityAxis: ReceivingActivityAxis;
  /** The page's Find text (sidebar or global header) — the cards face reads it. */
  query: string;
  openRowId: number | null;
  onOpen: (row: ReceivingLineRow) => void;
  onClose: () => void;
  selectedIds: Set<number>;
  onToggleRow: (row: ReceivingLineRow) => void;
  chips: ReactNode;
  searchEmpty: ReactNode | null;
  allClear: ReactNode;
  record: TriageRecordSlot;
}) {
  const family = useMemo(
    () =>
      triageFamily(VIEW, {
        rowId: receivingLineId,
        groupKey: cartonCardKey,
        cardModel: (group) => cartonCardModel(group, activityAxis),
        exactFind: cartonExactFind,
        renderCard: (props) => <CartonCard {...props} />,
      }),
    [activityAxis],
  );
  const selection = useReceivingSelectionPort(selectedIds, onToggleRow, rows);
  const painted = useMemo(() => bands.flatMap(([, groups]) => groups.flatMap((group) => group.rows)), [bands]);
  const feed: TriageFeed<ReceivingLineRow> = {
    bands,
    allBands,
    painted,
    sectioned,
    loading,
    fetching: loading,
    search: { value: query, pending: false },
    selection,
    open: { id: openRowId, open: onOpen, close: onClose },
  };
  return (
    <TriageCardList
      family={family}
      feed={feed}
      cut={cut}
      record={record}
      summary={chips}
      bulk={<ReceivingSelectionVerbs noun="receipts" />}
      searchEmpty={searchEmpty}
      allClear={allClear}
    />
  );
}
