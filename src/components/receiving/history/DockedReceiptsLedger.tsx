'use client';

import { useCallback, useMemo, useState, type ReactNode, type RefObject } from 'react';
import { Button, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, SearchField } from '@/design-system/primitives';
import { RecordLedger } from '@/design-system/components/record-ledger/RecordLedger';
import { EvidenceNotice, EvidenceTitle } from '@/design-system/components/record-ledger/RecordEvidence';
import { HistoryCartonTriagePanel } from '@/components/receiving/history/HistoryCartonTriagePanel';
import { receivingLineMatchesQuery } from '@/lib/receiving/receiving-line-search';
import { usePublishRecordCursor, useRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { historyTriageTargetFromRow } from '@/lib/receiving/history-triage-row';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { GroupedRenderOrder } from '@/lib/group-rows';
import { DockedReceivingRecord, dockedReceivingState } from './DockedReceivingRecord';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import { defaultDirForReceivingGridSort, isReceivingGridSortable, type ReceivingGridColumnKey } from '@/lib/receiving/receiving-grid-layout';
import { compareReceivingGridRows } from '@/lib/receiving/receiving-grid-compare';
import type { ReceivingActivityAxis } from '@/components/station/receiving-lines-table-helpers';

const receivingLineId = (row: ReceivingLineRow): number => row.id;
const SORTS: readonly { key: ReceivingGridColumnKey; label: string }[] = [
  { key: 'date', label: 'Activity date' },
  { key: 'order', label: 'Purchase order' },
  { key: 'title', label: 'Product' },
  { key: 'qty', label: 'Quantity' },
  { key: 'tracking', label: 'Tracking' },
];

export function DockedReceiptsLedger({
  rows,
  loading,
  emptyMessage,
  query,
  onQueryChange,
  activityAxis,
  toolbarExtra,
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
  onQueryChange: (value: string) => void;
  activityAxis: ReceivingActivityAxis;
  toolbarExtra?: ReactNode;
  selectedId: number | null;
  selectedIds: Set<number>;
  onOpenRow: (row: ReceivingLineRow) => void;
  onCloseRow: () => void;
  onToggleRow: (row: ReceivingLineRow) => void;
  scrollRef: RefObject<HTMLDivElement>;
}) {
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const { sort, dir, toggleColumnSort, clear } = useUrlColumnSort<ReceivingGridColumnKey>({
    isColumn: isReceivingGridSortable,
    defaultDir: defaultDirForReceivingGridSort,
  });
  const states = useMemo(() => [...new Map(rows.map((row) => {
    const state = dockedReceivingState(row);
    return [state.id, state] as const;
  })).values()], [rows]);
  const visibleRows = useMemo(() => {
    const result = rows.filter((row) => receivingLineMatchesQuery(row, query)
      && (!stateFilter || dockedReceivingState(row).id === stateFilter));
    return sort && dir ? result.sort((a, b) => compareReceivingGridRows(a, b, sort, dir, activityAxis)) : result;
  }, [query, rows, stateFilter, sort, dir, activityAxis]);
  const cursorOrder = useMemo<GroupedRenderOrder<ReceivingLineRow>>(
    () => [['docked', [{ key: 'docked', rows: visibleRows }]]],
    [visibleRows],
  );
  const openRow = useMemo(
    () => visibleRows.find((row) => row.id === selectedId) ?? null,
    [selectedId, visibleRows],
  );

  const open = useCallback((row: ReceivingLineRow) => {
    onOpenRow(row);
  }, [onOpenRow]);
  const close = useCallback(() => {
    onCloseRow();
  }, [onCloseRow]);

  usePublishRecordCursor({
    surfaceId: 'incoming-docked-ledger',
    scope: 'record',
    enabled: true,
    order: cursorOrder,
    openId: openRow?.id ?? null,
    getId: receivingLineId,
    onOpen: open,
    onClose: close,
  });
  const navigation = useRecordCursor('record');
  const target = openRow ? historyTriageTargetFromRow(openRow) : null;

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

  return (
    <RecordLedger
      testId="docked-receipts-ledger"
      label="Docked receiving history"
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
          <SearchField
            value={query}
            onChange={onQueryChange}
            placeholder="Filter docked records…"
            className="min-w-0 flex-1 overflow-hidden rounded-none pl-2"
            tone="neutral"
            hideUnderline
            fillHost
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="sm">{states.find((state) => state.id === stateFilter)?.label || 'State'}</Button></DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => setStateFilter(null)}>All states</DropdownMenuItem>
              {states.map((state) => <DropdownMenuItem key={state.id} onSelect={() => setStateFilter(state.id)}>{state.label}</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="sm">{sort ? `${SORTS.find((option) => option.key === sort)?.label || sort} · ${dir}` : 'Sort'}</Button></DropdownMenuTrigger>
            <DropdownMenuContent>
              {SORTS.map((option) => <DropdownMenuItem key={option.key} onSelect={() => toggleColumnSort(option.key)}>{option.label}</DropdownMenuItem>)}
              <DropdownMenuItem onSelect={clear}>Default order</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {toolbarExtra}
        </>
      }
      empty={<b className="text-role-body font-bold text-mode-ink">{query.trim() || stateFilter ? 'No matching records in the loaded history.' : emptyMessage}</b>}
      evidenceNoun="receipt"
      evidence={
        target ? <HistoryCartonTriagePanel
          key={`${target.receivingId}:${target.receivingLineId}`}
          target={target}
          seedRow={openRow ?? undefined}
          onClose={close}
          embedded
        /> : <>
          <EvidenceTitle sub={`${visibleRows.length.toLocaleString()} visible records`}>Receiving history</EvidenceTitle>
          <EvidenceNotice>{openRow ? 'No carton identity is available for this record.' : 'Select a record to inspect receipt, tracking, photos, and activity.'}</EvidenceNotice>
        </>
      }
      footer={<span>{visibleRows.length.toLocaleString()} docked records</span>}
    />
  );
}
