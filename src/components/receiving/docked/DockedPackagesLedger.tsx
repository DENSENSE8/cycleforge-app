'use client';

/**
 * Deliveries › Docked — a package-first multi-height carton table for packages that have a
 * physical arrival scan and have not entered Unbox. Tracking is the primary
 * handle. It shares Unboxed's readable stacked-card grammar, never the compact
 * one-row table grammar, while keeping a separate Docked population and copy.
 */

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { RecordLedgerSummaryPane, type RecordLedgerSummary } from '@/design-system/components/record-ledger/RecordLedgerSummary';
import { RecordActionStrip } from '@/design-system/components/record-action-strip/RecordActionStrip';
import { StatusChipRail, type StatusChip } from '@/design-system/components/QueueStatusChips';
import { TriageCardList, type TriageFeed } from '@/design-system/components/triage-card-list/TriageCardList';
import { TriageAllClear } from '@/design-system/components/triage-card-list/TriageListBody';
import { useTriageCut } from '@/design-system/components/triage-card-list/triage-list-state';
import { triageFamily } from '@/design-system/components/triage-card-list/triage-view';
import { ReceivingSelectionVerbs } from '@/components/receiving/ReceivingSelectionVerbs';
import { useReceivingSelectionPort } from '@/components/receiving/use-receiving-selection-port';
import { CartonRecordView } from '@/components/receiving/history/CartonRecordView';
import { cartonRecordTitle, useCartonRecord } from '@/components/receiving/history/use-carton-record';
import { useCartonVerbs } from '@/components/receiving/history/carton-record-verbs';
import { cartonBands, cartonCardKey, cartonCardModel } from '@/components/receiving/history/cards/carton-card-model';
import { ReceivingCartonCard } from '@/components/receiving/history/cards/CartonCard';
import { INCOMING_DOCKED_VIEW } from '@/lib/triage/views';
import { DOCKED_KIND_OPTIONS, dockedIntakeKind, dockedPackageRecordFace } from '@/lib/receiving/docked-record-state';
import { receivingLineMatchesQuery } from '@/lib/receiving/receiving-line-search';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { usePublishRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { DOCKED_KIND_PARAM } from '@/lib/receiving/inbound-lane';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import { defaultDirForReceivingGridSort, isReceivingGridSortable, type ReceivingGridColumnKey } from '@/lib/receiving/receiving-grid-layout';
import { compareReceivingGridRows } from '@/lib/receiving/receiving-grid-compare';

const VIEW = INCOMING_DOCKED_VIEW;
const DOCKED_STATUS_KEYS = ['DOCKED'] as const;
type DockedStatusKey = (typeof DOCKED_STATUS_KEYS)[number];
const KIND_VALUES = new Set<string>(DOCKED_KIND_OPTIONS.map((option) => option.value));
const rowId = (row: ReceivingLineRow) => row.id;

export function DockedPackagesLedger({
  rows,
  loading,
  emptyMessage,
  query,
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
  selectedId: number | null;
  selectedIds: Set<number>;
  onOpenRow: (row: ReceivingLineRow) => void;
  onCloseRow: () => void;
  onToggleRow: (row: ReceivingLineRow) => void;
}) {
  const searchParams = useSearchParams();
  const kindRaw = searchParams.get(DOCKED_KIND_PARAM);
  const kind = kindRaw && KIND_VALUES.has(kindRaw) ? kindRaw : null;
  const { sort, dir } = useUrlColumnSort<ReceivingGridColumnKey>({
    isColumn: isReceivingGridSortable,
    defaultDir: defaultDirForReceivingGridSort,
  });
  const visibleRows = useMemo(
    () => {
      const found = rows.filter(
        (row) => receivingLineMatchesQuery(row, query) && (!kind || dockedIntakeKind(row) === kind),
      );
      return sort && dir
        ? found.sort((a, b) => compareReceivingGridRows(a, b, sort, dir, 'scanned'))
        : found;
    },
    [dir, kind, query, rows, sort],
  );
  const sectioned = !sort || sort === 'date';
  const allBands = useMemo(() => cartonBands(visibleRows, 'scanned', sectioned), [sectioned, visibleRows]);
  const cut = useTriageCut<DockedStatusKey>({ statusKeys: DOCKED_STATUS_KEYS, recordParams: VIEW.recordParams, statusParam: VIEW.chips.param });
  const bands = useMemo(() => cut.filterBands(allBands, cartonCardKey, () => DOCKED_STATUS_KEYS), [allBands, cut]);
  const painted = useMemo(() => bands.flatMap(([, groups]) => groups.flatMap((group) => group.rows)), [bands]);
  const openRow = useMemo(() => painted.find((row) => row.id === selectedId) ?? null, [painted, selectedId]);
  const open = useCallback((row: ReceivingLineRow) => onOpenRow(row), [onOpenRow]);
  const close = useCallback(() => onCloseRow(), [onCloseRow]);

  usePublishRecordCursor({
    surfaceId: 'incoming-docked-packages',
    scope: 'record',
    enabled: true,
    order: bands,
    openId: openRow?.id ?? null,
    getId: rowId,
    onOpen: open,
    onClose: close,
  });

  const carton = useCartonRecord(openRow);
  const verbs = useCartonVerbs(carton, close);
  const selection = useReceivingSelectionPort(selectedIds, onToggleRow, visibleRows);
  const family = useMemo(
    () => triageFamily(VIEW, {
      rowId,
      groupKey: cartonCardKey,
      cardModel: (group) => cartonCardModel(group, 'scanned', 'docked'),
      state: (group) => dockedPackageRecordFace(group.rows[0]!),
      exactFind: (find, model) => model.rows.some((row) => receivingLineMatchesQuery(row, find)),
      renderCard: (props) => <ReceivingCartonCard {...props} view={VIEW} />,
    }),
    [],
  );
  const feed: TriageFeed<ReceivingLineRow> = {
    bands,
    allBands,
    painted,
    sectioned,
    loading,
    fetching: loading,
    search: { value: query, pending: false },
    selection,
    open: { id: openRow?.id ?? null, open, close },
  };
  const summary: RecordLedgerSummary = {
    title: 'Docked packages',
    sub: 'Arrival scanned · awaiting Unbox',
    facts: [{ label: 'Packages', value: allBands.reduce((sum, [, groups]) => sum + groups.length, 0) }],
    note: 'Tracking is the primary package identity. Open a row to inspect its arrival, items and next receiving step.',
  };
  const statusChips = useMemo<StatusChip<DockedStatusKey>[]>(
    () => [{ id: 'DOCKED', label: 'Docked', tone: 'info', count: allBands.reduce((sum, [, groups]) => sum + groups.length, 0) }],
    [allBands],
  );

  return (
    <div data-testid="docked-packages-ledger" className="flex min-h-0 min-w-0 flex-1">
      <TriageCardList
        family={family}
        feed={feed}
        cut={cut}
        summary={
          <StatusChipRail
            chips={statusChips}
            active={cut.url.statusFilter}
            onToggle={cut.url.toggleStatus}
            onReset={cut.url.resetStatus}
            testId="docked-status-chips"
          />
        }
        bulk={<ReceivingSelectionVerbs noun="packages" advance="unboxed" />}
        searchEmpty={query.trim() ? <p className="text-sm text-text-muted">No docked package matches those tracking digits.</p> : null}
        allClear={<TriageAllClear title={emptyMessage} detail="Arrival-scanned packages wait here until Unbox begins." />}
        record={{
          title: openRow ? cartonRecordTitle(openRow) : 'Docked package',
          noun: 'package',
          testId: 'docked-package-record',
          summary: <RecordLedgerSummaryPane summary={summary} />,
          view: openRow && carton ? <CartonRecordView record={carton} openLineId={openRow.id} onClose={close} surface="docked" /> : null,
          strip: openRow && carton ? <RecordActionStrip verbs={verbs} label={`${cartonRecordTitle(openRow)} actions`} /> : null,
        }}
      />
    </div>
  );
}
