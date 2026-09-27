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
import { useDeskFloorFace, useDeskStageOptional } from '@/design-system/components/DeskStageContext';
import { IncomingDeliveryCardList } from './cards/IncomingDeliveryCardList';
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

interface IncomingDeliveriesLedgerProps {
  groups: readonly [string, RowGroup<ReceivingLineRow>[]][];
  rows: readonly ReceivingLineRow[];
  loading: boolean;
  emptyMessage: string;
  /** The ledger's own search field — omitted on `/incoming`, where the sidebar Find owns search. */
  query?: string;
  onQueryChange?: (value: string) => void;
  filter: DataTableFilterChrome;
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
  filter,
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

  const summary = useMemo(() => incomingDeliverySummary(rows, lane), [lane, rows]);

  // Two faces over one state (owner 2026-09-27, the To-ship pattern): on a
  // desk stage, In place / Split paint the triage cards and Floor
  // (⌘/Ctrl+Shift+F) the industrial ledger. Off a stage (the Unbox embed) the
  // ledger is the only face.
  const stage = useDeskStageOptional();
  useDeskFloorFace(stage != null);
  const cardsFace = stage != null && stage.view !== 'floor';

  const recordTitle = openRow ? `PO ${purchaseIdentity(openRow)}` : 'Delivery';
  const recordSubtitle = openRow ? displayReceivingProductTitle(openRow) : undefined;
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
  const tableControls = (
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
    const position = recordNavigation.available ? recordNavigation.position : null;
    return (
      <IncomingDeliveryCardList
        groups={groups}
        loading={loading}
        empty={emptyMessage}
        openKey={openKey}
        onOpenKey={handleOpen}
        onClose={close}
        selectedIds={selectedIds}
        onToggleRow={onToggleRow}
        toolbar={tableControls}
        statusChips={statusChips ? <IncomingStatusChips set={statusChips} face="cards" /> : null}
        notice={notice ?? null}
        sectioned={sectioned}
        recordTitle={recordTitle}
        recordSubtitle={recordSubtitle}
        record={record}
        actionStrip={actionStrip}
        indexLabel={openKey != null && position != null ? `${position} of ${recordNavigation.total}` : undefined}
        summary={summary}
        footer={footer}
        scrollRef={scrollRef}
      />
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
              className="min-w-0 flex-1 overflow-hidden rounded-none pl-2"
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
      recordSubtitle={recordSubtitle}
      recordNoun="delivery"
      actionStrip={actionStrip}
      summary={summary}
      record={record}
      footer={footer}
    />
  );
}
