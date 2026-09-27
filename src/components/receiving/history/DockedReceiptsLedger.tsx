'use client';

import { useCallback, useMemo, useState, type ReactNode, type RefObject } from 'react';
import { Button, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, SearchField } from '@/design-system/primitives';
import { RecordLedger } from '@/design-system/components/record-ledger/RecordLedger';
import { RecordActionStrip } from '@/design-system/components/record-action-strip/RecordActionStrip';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { CartonRecordView } from '@/components/receiving/history/CartonRecordView';
import { cartonRecordTitle, useCartonRecord } from '@/components/receiving/history/use-carton-record';
import { useCartonVerbs } from '@/components/receiving/history/carton-record-verbs';
import { receivingLineMatchesQuery } from '@/lib/receiving/receiving-line-search';
import { usePublishRecordCursor, useRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { GroupedRenderOrder } from '@/lib/group-rows';
import { DockedReceivingRecord } from './DockedReceivingRecord';
import { dockedReceivingState } from '@/lib/receiving/docked-record-state';
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
  /** Omitted on `/incoming` — the sidebar Find owns search there; `query` still narrows. */
  onQueryChange?: (value: string) => void;
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
  // The open carton's read — shared by the record view and the strip's verbs.
  const carton = useCartonRecord(openRow);
  const verbs = useCartonVerbs(carton, close);

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
          {onQueryChange ? (
            <SearchField
              value={query}
              onChange={onQueryChange}
              placeholder="Filter docked records…"
              className="min-w-0 flex-1 overflow-hidden rounded-mode-control pl-2"
              tone="neutral"
              hideUnderline
              fillHost
            />
          ) : (
            <span className="flex-1" />
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                {states.find((state) => state.id === stateFilter)?.label || 'State'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => setStateFilter(null)}>All states</DropdownMenuItem>
              {states.map((state) => (
                <DropdownMenuItem key={state.id} onSelect={() => setStateFilter(state.id)}>
                  {state.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
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
          {toolbarExtra}
        </>
      }
      actionStrip={
        openRow && carton ? (
          <RecordActionStrip
            key={carton.receivingId}
            verbs={verbs}
            label={`${cartonRecordTitle(openRow)} actions`}
            testId="carton-actions"
          />
        ) : null
      }
      empty={
        <b className="text-role-body font-bold text-mode-ink">
          {query.trim() || stateFilter ? 'No matching records in the loaded history.' : emptyMessage}
        </b>
      }
      recordTitle={openRow ? cartonRecordTitle(openRow) : 'Receipt'}
      recordSubtitle={openRow ? `Carton ${openRow.receiving_id ?? openRow.id}` : undefined}
      recordNoun="receipt"
      summary={{
        title: 'Receiving history',
        facts: [{ label: 'Visible records', value: visibleRows.length }],
        note: 'Select a record to inspect its status, items, shipment, photos, and timeline.',
      }}
      record={
        openRow && carton ? (
          <CartonRecordView key={carton.receivingId} record={carton} openLineId={openRow.id} onClose={close} />
        ) : openRow ? (
          <EvidenceNotice>No carton identity is available for this record.</EvidenceNotice>
        ) : null
      }
      footer={<span>{visibleRows.length.toLocaleString()} docked records</span>}
    />
  );
}
