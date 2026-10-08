'use client';

/**
 * Deliveries › Unboxed — the cartons already opened at Unbox. One face: the shared
 * triage face ({@link TriageCardList}, one card per carton), on a desk stage
 * and off it (the Unbox History tab). Find lives in the page header; Sort
 * lives in the contextual sidebar.
 *
 * The host owns the loaded rows (up to the history window), the sidebar's Sort
 * and Kind (`?dkind=`), and the attention cut — `?dflag=` (Claim · Short ·
 * Unfound, comma-separated), written by the sidebar's Status facet
 * (`src/lib/nav/facets/unbox.ts`, counted from the same rows and steps).
 */

import { useCallback, useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { RecordLedgerSummaryPane, type RecordLedgerSummary } from '@/design-system/components/record-ledger/RecordLedgerSummary';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { TriageCardList, type TriageFeed, type TriageRecordSlot } from '@/design-system/components/triage-card-list/TriageCardList';
import { triageFamily } from '@/design-system/components/triage-card-list/triage-view';
import { TriageAllClear } from '@/design-system/components/triage-card-list/TriageListBody';
import { useTriageCut, type TriageCut } from '@/design-system/components/triage-card-list/triage-list-state';
import { cartonRecordTitle } from '@/components/receiving/history/use-carton-record';
import { useInboundCartonRecord } from '@/components/receiving/record/useInboundRecord';
import { useRecordSlot } from '@/design-system/components/record-ledger/useRecordSlot';
import { ReceivingSelectionVerbs } from '@/components/receiving/ReceivingSelectionVerbs';
import { useReceivingSelectionPort } from '@/components/receiving/use-receiving-selection-port';
import { receivingLineMatchesQuery } from '@/lib/receiving/receiving-line-search';
import { usePublishRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { GroupedRenderOrder } from '@/lib/group-rows';
import { DOCKED_FLAG_OPTIONS, DOCKED_KIND_OPTIONS, dockedCartonFlags, dockedIntakeKind, dockedRecordFace, type DockedFlag } from '@/lib/receiving/docked-record-state';
import { DOCKED_KIND_PARAM } from '@/lib/receiving/inbound-lane';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import { defaultDirForReceivingGridSort, isReceivingGridSortable, type ReceivingGridColumnKey } from '@/lib/receiving/receiving-grid-layout';
import { compareReceivingGridRows } from '@/lib/receiving/receiving-grid-compare';
import type { ReceivingActivityAxis } from '@/lib/receiving/receiving-stage-stamp';
import { INCOMING_UNBOXED_VIEW } from '@/lib/triage/views';
import { CartonCard } from './cards/CartonCard';
import { cartonBands, cartonCardKey, cartonCardModel, groupCartons, type CartonCardModel } from './cards/carton-card-model';

const VIEW = INCOMING_UNBOXED_VIEW;

const receivingLineId = (row: ReceivingLineRow): number => row.id;

/** Every pill the `?dflag=` cut can name, in pill order — attention only; "Unboxed" is the view itself. */
const FLAG_KEYS: readonly string[] = DOCKED_FLAG_OPTIONS.map((option) => option.value);
const KIND_VALUES = new Set<string>(DOCKED_KIND_OPTIONS.map((option) => option.value));
/** A Find naming exactly one carton — its PO / order #, carton #, or tracking — opens it. */
const cartonExactFind = (query: string, card: CartonCardModel) =>
  card.identity.toLowerCase() === query ||
  card.orderId?.toLowerCase() === query ||
  String(card.lead.receiving_id ?? '') === query.replace(/^#/, '') ||
  card.rows.some((row) => (row.tracking_number ?? '').toLowerCase() === query);

export function UnboxedReceiptsLedger({
  rows,
  loading,
  emptyMessage,
  query,
  activityAxis,
  toolbarExtra,
  selectedId,
  selectedIds,
  onOpenRow,
  onCloseRow,
  onToggleRow,
}: {
  rows: readonly ReceivingLineRow[];
  loading: boolean;
  emptyMessage: string;
  query: string;
  activityAxis: ReceivingActivityAxis;
  toolbarExtra?: ReactNode;
  selectedId: number | null;
  selectedIds: Set<number>;
  onOpenRow: (row: ReceivingLineRow) => void;
  onCloseRow: () => void;
  onToggleRow: (row: ReceivingLineRow) => void;
}) {
  // The attention cut lives in `?dflag=` — the sidebar's Status facet writes it,
  // a saved view and a reload keep it.
  const cut = useTriageCut({ statusKeys: FLAG_KEYS, recordParams: VIEW.recordParams, statusParam: VIEW.chips.param });
  const { statusFilter } = cut.url;
  const { sort, dir } = useUrlColumnSort<ReceivingGridColumnKey>({
    isColumn: isReceivingGridSortable,
    defaultDir: defaultDirForReceivingGridSort,
  });
  const kindRaw = useSearchParams().get(DOCKED_KIND_PARAM);
  const kind = kindRaw && KIND_VALUES.has(kindRaw) ? kindRaw : null;
  // Find + Kind + Sort over the loaded history.
  const foundRows = useMemo(() => {
    const result = rows.filter((row) => receivingLineMatchesQuery(row, query) && (!kind || dockedIntakeKind(row) === kind));
    return sort && dir ? result.sort((a, b) => compareReceivingGridRows(a, b, sort, dir, activityAxis)) : result;
  }, [query, kind, rows, sort, dir, activityAxis]);
  // Pills are carton facts: every line answers with its carton's flags.
  const statusOfRow = useMemo(() => {
    const byRow = new Map<number, DockedFlag[]>();
    for (const group of groupCartons(foundRows)) {
      const flags = dockedCartonFlags(group.rows);
      for (const row of group.rows) byRow.set(row.id, flags);
    }
    return (row: ReceivingLineRow): DockedFlag[] => byRow.get(row.id) ?? [];
  }, [foundRows]);

  // Cards: cartons in activity-day sections under the default (activity) sort.
  const sectioned = !sort || sort === 'date';
  const allCartonBands = useMemo(() => cartonBands(foundRows, activityAxis, sectioned), [foundRows, activityAxis, sectioned]);
  const { filterBands } = cut;
  const cardBands = useMemo(() => filterBands(allCartonBands, cartonCardKey, statusOfRow), [filterBands, allCartonBands, statusOfRow]);

  const cardRows = useMemo(() => cardBands.flatMap(([, groups]) => groups.flatMap((group) => group.rows)), [cardBands]);
  const openRow = useMemo(() => cardRows.find((row) => row.id === selectedId) ?? null, [cardRows, selectedId]);

  const open = useCallback((row: ReceivingLineRow) => onOpenRow(row), [onOpenRow]);
  const close = useCallback(() => onCloseRow(), [onCloseRow]);

  usePublishRecordCursor({
    surfaceId: 'incoming-docked-ledger',
    scope: 'record',
    enabled: true,
    order: cardBands,
    openId: openRow?.id ?? null,
    getId: receivingLineId,
    onOpen: open,
    onClose: close,
  });
  // The open carton's read — shared by the record view and its Actions panel verbs.
  const carton = useInboundCartonRecord(openRow, close);
  const slot = useRecordSlot(carton?.model ?? null, carton?.verbs ?? [], openRow ? `${cartonRecordTitle(openRow)} actions` : 'Receipt actions', 'inbound-record');

  const recordView = slot?.view ?? (openRow ? <EvidenceNotice>No carton identity is available for this record.</EvidenceNotice> : null);
  const summary: RecordLedgerSummary = {
    title: 'Unboxed cartons',
    facts: [{ label: 'Visible cartons', value: cardBands.reduce((sum, [, groups]) => sum + groups.length, 0) }],
    note: 'Select a record to inspect its status, items, shipment, photos, and timeline.',
  };
  const narrowed = Boolean(query.trim()) || statusFilter.size > 0;


  // Off the desk (the Unbox History tab) the host's week pill rides above the list.
  const controls = toolbarExtra ? (
    <div className="flex shrink-0 items-center gap-2 border-b border-border-soft px-3 py-1">
      <span className="flex-1" />
      {toolbarExtra}
    </div>
  ) : null;

  return (
    <div data-testid="unboxed-receipts-ledger" data-face="cards" className="flex min-h-0 min-w-0 flex-1 flex-col">
      {controls}
      <div className="flex min-h-0 min-w-0 flex-1">
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
          searchEmpty={narrowed ? <p className="text-sm text-text-muted">No matching unboxed cartons.</p> : null}
          allClear={<TriageAllClear title={emptyMessage} detail="Nothing unboxed yet." />}
          record={{
            title: slot?.title ?? (openRow ? cartonRecordTitle(openRow) : 'Receipt'),
            noun: VIEW.noun.one,
            showIndex: false,
            testId: 'unboxed-receipts-ledger-record',
            summary: <RecordLedgerSummaryPane summary={summary} />,
            view: recordView,
            strip: null,
          }}
        />
      </div>
    </div>
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
        state: (group) => dockedRecordFace(group.rows[0]!),
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
      sections="by-state"
      family={family}
      feed={feed}
      cut={cut}
      record={record}
      summary={null}
      bulk={<ReceivingSelectionVerbs noun="receipts" advance="received" />}
      searchEmpty={searchEmpty}
      allClear={allClear}
    />
  );
}
