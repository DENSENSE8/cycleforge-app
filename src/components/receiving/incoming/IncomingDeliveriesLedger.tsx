'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  DataTableFilterMenu,
  DataTableSortMenu,
  type DataTableFilterChrome,
  type DataTableSortOption,
} from '@/components/tables/DataTable';
import { SearchField, Button } from '@/design-system/primitives';
import { RecordLedger } from '@/design-system/components/record-ledger/RecordLedger';
import { RecordActionStrip } from '@/design-system/components/record-action-strip/RecordActionStrip';
import { useRouter } from 'next/navigation';
import { buildIncomingDeliveryVerbs } from './incoming-record-verbs';
import { RECORD_ID_CLASS } from '@/design-system/tokens/industrial-record';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { IncomingGridColumnKey } from '@/lib/receiving/receiving-grid-layout';
import type { RowGroup } from '@/lib/group-rows';
import { foldKey } from '@/lib/group-rows';
import { usePublishRecordCursor, useRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { displayReceivingProductTitle } from '@/components/station/receiving-grid/cells';
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

export interface IncomingDeliveriesLedgerProps {
  groups: readonly [string, RowGroup<ReceivingLineRow>[]][];
  rows: readonly ReceivingLineRow[];
  loading: boolean;
  emptyMessage: string;
  query: string;
  onQueryChange: (value: string) => void;
  filter: DataTableFilterChrome;
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
  filter,
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

  usePublishRecordCursor({
    surfaceId: 'incoming-deliveries-ledger',
    scope: 'record',
    enabled: true,
    order: groups,
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

  const summary = useMemo(() => incomingDeliverySummary(rows), [rows]);

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
      toolbar={
        <>
          <SearchField
            value={query}
            onChange={onQueryChange}
            placeholder="Filter incoming…"
            className="min-w-0 flex-1 overflow-hidden rounded-none pl-2"
            tone="neutral"
            hideUnderline
            fillHost
          />
          <DataTableFilterMenu {...filter} />
          <DataTableSortMenu
            options={SORT_OPTIONS}
            active={sort}
            hot={sort != null}
            activeFace={sort && sortDir ? { label: `${sort} · ${sortDir}` } : undefined}
            onSelect={(id) => onSort(id as IncomingGridColumnKey)}
          />
        </>
      }
      empty={<b className="text-role-body font-bold text-mode-ink">{emptyMessage}</b>}
      recordTitle={openRow ? `PO ${purchaseIdentity(openRow)}` : 'Delivery'}
      recordSubtitle={openRow ? displayReceivingProductTitle(openRow) : undefined}
      recordNoun="delivery"
      actionStrip={
        openRow ? (
          <RecordActionStrip
            key={openKey}
            verbs={buildIncomingDeliveryVerbs({ row: openRow, delivery, navigate: router.push, onRemoved: close })}
            label={`PO ${purchaseIdentity(openRow)} actions`}
            testId="incoming-actions"
          />
        ) : null
      }
      summary={summary}
      record={
        openRow ? (
          <IncomingDeliveryEvidence
            key={openRow.id}
            row={openRow}
            lines={openLines}
            state={incomingDeliveryRecordState(openRow)}
            delivery={delivery}
          />
        ) : null
      }
      footer={
        <>
          <span>{shownStart.toLocaleString()}–{shownEnd.toLocaleString()} of {total.toLocaleString()}</span>
          <span className="ml-auto inline-flex items-center gap-1">
            <Button type="button" variant="ghost" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
            <span className={RECORD_ID_CLASS}>{page} / {pageCount}</span>
            <Button type="button" variant="ghost" size="sm" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>Next</Button>
          </span>
        </>
      }
    />
  );
}
