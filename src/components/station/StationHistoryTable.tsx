'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { StationPipelineBoard } from '@/components/station/StationPipelineBoard';
import { StationQueueRow } from '@/components/station/StationQueueRow';
import { NonlinearTableHost } from '@/components/tables/NonlinearTableHost';
import { STATION_HISTORY_TABLE_BINDING } from '@/components/station/station-history-grid/station-history-table-definition';
import { OrdersQueueColumnHeader } from '@/components/dashboard/orders-queue/OrdersQueueColumnHeader';
import { TableColumnConfigProvider } from '@/components/ui/table-column-config/TableColumnConfig';
import { TableDensityProvider } from '@/components/ui/table-density/TableDensityProvider';
import { TableOptionsMenu } from '@/components/ui/table-options/TableOptionsMenu';
import { Copy, X } from '@/components/Icons';
import { emitToggleAll } from '@/lib/selection/table-selection';
import { useTableSelectMode } from '@/hooks/useTableSelectMode';
import { useUIModeOptional } from '@/design-system/providers/UIModeProvider';
import { toTsvBlock } from '@/lib/station/format-station-copy-row';
import { getStationSourceRecord, type StationSourceKind } from '@/lib/station/record-to-queue-row';
import type { QueueRowRecord } from '@/components/dashboard/orders-queue/helpers';
import type { RowGroup } from '@/lib/group-rows';
import {
  ORDERS_QUEUE_COLUMNS,
  type OrdersQueueColumn,
  type OrdersQueueColumnKey,
} from '@/lib/dashboard-order-row-layout';
import type { SwimlaneLaneDef } from '@/components/board/SwimlaneBoard';
import type { BoardPrefsKey } from '@/lib/neon/staff-preferences-queries';
import type { WeekRange } from '@/components/dashboard/orders-queue/helpers';
import type { TableId } from '@/lib/tables/table-columns';
import { sumDaySectionCounts } from '@/components/station/station-table-logic';
import { STATION_PIPELINE_BOARDS } from '@/lib/station/flags';
import { LAYOUT_PARAM, parseLayout, type StationLayout } from '@/lib/station/table-url-params';
import { useStationReconnectSync } from '@/hooks/station/useStationReconnectSync';
import { DateRangePickerPill } from '@/components/ui/DateRangeHeader';
import { formatWeekRangeCompact } from '@/utils/date';

/**
 * `StationHistoryTable<T>` — the shell for the Tech / Packer history tables
 * (station-table-unification-plan §Phase 2, cut over 2026-07-28). Rows render
 * through the shared `OrdersQueueTableRow` (via {@link StationQueueRow}) inside
 * the unified {@link StationListTable}, which composes the Workbench spreadsheet
 * SoT `LedgerGrid` — the same grid the Queue tab uses. The benches get
 * windowing, the week band, the ⋮ menu (row density / layout), bulk
 * select, and a typed first-run empty. Saved views live on Band-3 Views ▾.
 *
 * Wraps the per-staff `TableColumnConfigProvider` + `TableDensityProvider` (both
 * keyed by `tableId`) so density + hidden-column prefs stay wired for rows.
 */
export interface StationHistoryTableProps<T> {
  loading: boolean;
  isRefreshing: boolean;
  weekRange: WeekRange;
  weekOffset: number;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onResetWeek?: () => void;
  /** `[date, records]` bands, newest day first, each day's rows pre-sorted. */
  daySections: [string, T[]][];
  /** Stable row key so windowing survives re-sorts. */
  getRowKey?: (record: T, index: number) => string;
  /** Per-staff column-config + density bag (`tech` | `packer`). */
  tableId: TableId;
  emptyMessage: string;
  /** Teaching first-run empty (zero rows, no active filter). */
  firstRunEmpty?: ReactNode;
  /** Portal display controls into the owning workspace chrome. */
  toolbarPortalTarget?: HTMLElement | null;
  /** Pipeline (board) config — enables the Pipeline/All toggle (behind
   *  `NEXT_PUBLIC_STATION_PIPELINE_BOARDS`). Records are the flat, unbanded set;
   *  the board buckets + day-bands per lane. Omit → no board toggle. */
  pipeline?: {
    records: T[];
    lanes: SwimlaneLaneDef<string>[];
    bucket: (row: T) => string;
    prefsKey: BoardPrefsKey;
    toDaySections: (records: T[]) => [string, T[]][];
    getRowDate?: (row: T) => string | null | undefined;
  };
  /** Converged rendering + bulk select (Phase 7): rows render through the shared
   *  `OrdersQueueTableRow` (via `StationQueueRow`) with a checkbox + copy-TSV
   *  bulk bar. */
  selection: {
    scope: string;
    queueMode: StationSourceKind;
    /** Map a domain record → the queue-row shape (record-to-queue-row mapper). */
    toQueueRow: (record: T) => QueueRowRecord;
    getRecordId: (record: T) => number;
    onOpen: (record: T) => void;
    /** TSV line for one record + the header row (format-station-copy-row). */
    formatCopyRow: (record: T) => string;
    copyHeader: string[];
    /** Deep link: a URL param whose numeric value selects + scrolls to a row. */
    deepLinkParam?: string;
  };
}

export function StationHistoryTable<T>({
  loading,
  weekRange,
  weekOffset,
  onPrevWeek,
  onNextWeek,
  onResetWeek,
  daySections,
  getRowKey,
  tableId,
  emptyMessage,
  firstRunEmpty,
  toolbarPortalTarget = null,
  pipeline,
  selection,
}: StationHistoryTableProps<T>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isMobile } = useUIModeOptional();
  const totalCount = sumDaySectionCounts(daySections);

  // Reconnect-only broad invalidate (the hot path is Ably/local cache patches).
  useStationReconnectSync();

  // ── Bulk select + keyboard focus ──────────────────────────────────────────
  // Always on — left gutter ☐, no week-band pencil.
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const orderedRecords = useMemo(() => daySections.flatMap(([, recs]) => recs), [daySections]);
  const queueRows = useMemo(
    () => orderedRecords.map(selection.toQueueRow),
    [orderedRecords, selection],
  );
  const orderGroupsByDate = useMemo<[string, RowGroup<QueueRowRecord>[]][]>(
    () =>
      daySections.map(([date, recs]) => [
        date,
        recs.map((record) => ({
          key: `k:${selection.getRecordId(record)}`,
          rows: [selection.toQueueRow(record)],
        })),
      ]),
    [daySections, selection],
  );
  const getRecordId = useCallback((r: T) => selection.getRecordId(r), [selection]);
  const { selectedIds, toggle } = useTableSelectMode<T>({
    scope: selection.scope,
    selectMode: true,
    rows: orderedRecords,
    getId: getRecordId,
  });

  const copySelected = useCallback(async () => {
    const chosen = orderedRecords.filter((r) => selectedIds.has(selection.getRecordId(r)));
    if (chosen.length === 0) return;
    const block = toTsvBlock(selection.copyHeader, chosen.map(selection.formatCopyRow));
    try {
      await navigator.clipboard.writeText(block);
    } catch {
      /* clipboard blocked (permissions) — silently ignore */
    }
  }, [selection, orderedRecords, selectedIds]);

  const renderQueueRow = useCallback(
    (
      mapped: QueueRowRecord,
      index: number,
      columns: readonly OrdersQueueColumn[],
      rowIndex?: number,
    ) => {
      const source = getStationSourceRecord<T>(mapped);
      const id = source ? selection.getRecordId(source) : Number(mapped.id);
      return (
        <StationQueueRow
          record={mapped}
          index={index}
          rowIndex={rowIndex}
          queueMode={selection.queueMode}
          selectMode
          isChecked={selectedIds.has(id)}
          isSelected={focusedId === id}
          isMobile={isMobile}
          columns={columns}
          onToggleSelect={(event) => toggle(id, event.shiftKey)}
          onRowClick={(row) => {
            const rec = getStationSourceRecord<T>(row) ?? source;
            if (rec) selection.onOpen(rec);
          }}
        />
      );
    },
    [selection, selectedIds, isMobile, toggle, focusedId],
  );

  const renderRow = useCallback(
    (record: T, index: number, rowIndex?: number) =>
      renderQueueRow(selection.toQueueRow(record), index, ORDERS_QUEUE_COLUMNS, rowIndex),
    [renderQueueRow, selection],
  );

  const selectedCount = orderedRecords.filter((r) => selectedIds.has(selection.getRecordId(r))).length;

  // Keyboard focus → the row key to scroll to (works even when off-window).
  const focusedKey = useMemo(() => {
    if (focusedId == null || !getRowKey) return null;
    const rec = orderedRecords.find((r) => selection.getRecordId(r) === focusedId);
    return rec ? getRowKey(rec, 0) : null;
  }, [focusedId, orderedRecords, selection, getRowKey]);

  // Deep link: select + scroll to the row named by the URL param (?techLogId=…).
  const deepLinkValue = selection.deepLinkParam ? searchParams.get(selection.deepLinkParam) : null;
  useEffect(() => {
    if (!deepLinkValue) return;
    const targetId = Number(deepLinkValue);
    if (Number.isFinite(targetId) && orderedRecords.some((r) => selection.getRecordId(r) === targetId)) {
      setFocusedId(targetId);
    }
  }, [deepLinkValue, selection, orderedRecords]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (orderedRecords.length === 0) return;
      const curIdx = focusedId == null ? -1 : orderedRecords.findIndex((r) => selection.getRecordId(r) === focusedId);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = Math.min(orderedRecords.length - 1, curIdx < 0 ? 0 : curIdx + 1);
        setFocusedId(selection.getRecordId(orderedRecords[next]));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const next = Math.max(0, curIdx < 0 ? 0 : curIdx - 1);
        setFocusedId(selection.getRecordId(orderedRecords[next]));
      } else if (e.key === 'Enter' && curIdx >= 0) {
        e.preventDefault();
        selection.onOpen(orderedRecords[curIdx]);
      }
    },
    [selection, orderedRecords, focusedId],
  );

  const boardEnabled = Boolean(pipeline) && STATION_PIPELINE_BOARDS;
  const layout: StationLayout = boardEnabled ? parseLayout(searchParams.get(LAYOUT_PARAM)) : 'all';

  const setLayout = useCallback(
    (next: StationLayout) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'all') params.delete(LAYOUT_PARAM);
      else params.set(LAYOUT_PARAM, next);
      const qs = params.toString();
      router.replace(qs ? `${pathname || '/'}?${qs}` : pathname || '/', { scroll: false });
    },
    [searchParams, router, pathname],
  );

  // Saved views live on Band-3 Views ▾ (`WorkbenchViewsMenu`) — ⋮ keeps layout
  // / density only so the page-scoped slice has one locus.
  const optionsMenu = (
    <TableOptionsMenu
      layout={boardEnabled ? { value: layout, onChange: setLayout } : undefined}
    />
  );
  const headerControls = (
    <div className="flex items-center gap-2">
      {toolbarPortalTarget ? null : optionsMenu}
    </div>
  );
  const weekPill = (
    <DateRangePickerPill
      label={formatWeekRangeCompact(weekRange.startStr, weekRange.endStr)}
      count={totalCount}
      weekNav={{ weekOffset, onPrev: onPrevWeek, onNext: onNextWeek }}
    />
  );
  // House chrome recipe (Unbox · Shipped · FBA · Testing history): the period
  // calendar icon + ⋮ menu ride in the workbench chrome controls slot, so the
  // table itself is a plain framed card with no second header band inside it. A caller with no
  // portal target keeps the in-table `DateRangeHeader`.
  const portaledControls = toolbarPortalTarget
    ? createPortal(
        <div className="flex items-center gap-2">
          {weekPill}
          {optionsMenu}
        </div>,
        toolbarPortalTarget,
      )
    : null;

  // Bulk-action bar — pinned to the bottom of the table's relative region when
  // rows are selected. Copy-TSV + clear (Phase 7 §5.4).
  const bulkBar =
    selectedCount > 0 ? (
      <div className="absolute inset-x-0 bottom-3 z-toast flex justify-center">
        <div className="flex items-center gap-2 rounded-full border border-border-soft bg-surface-card px-3 py-1.5 shadow-lg ring-1 ring-black/5">
          <span className="text-role-caption font-semibold text-text-muted">{selectedCount} selected</span>
          {/* ds-raw-button: compact bulk-action capsule button */}
          <button
            type="button"
            onClick={() => void copySelected()}
            className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-2.5 py-1 text-role-caption font-semibold text-white transition-colors hover:bg-blue-700"
          >
            <Copy className="h-3.5 w-3.5" /> Copy
          </button>
          {/* ds-raw-button: clear-selection capsule button */}
          <button
            type="button"
            aria-label="Clear selection"
            onClick={() => emitToggleAll(selection.scope, 'none')}
            className="inline-flex items-center rounded-full p-1 text-text-faint transition-colors hover:text-text-default"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    ) : null;

  return (
    <TableColumnConfigProvider tableId={tableId}>
      <TableDensityProvider tableId={tableId}>
        {portaledControls}
        {boardEnabled && layout === 'board' && pipeline ? (
          <StationPipelineBoard<T, string>
            prefsKey={pipeline.prefsKey}
            lanes={pipeline.lanes}
            bucket={pipeline.bucket}
            records={pipeline.records}
            loading={loading}
            renderRow={renderRow}
            getRowKey={getRowKey}
            toDaySections={pipeline.toDaySections}
            getRowDate={pipeline.getRowDate}
            headerStartSlot={<div className="flex items-center gap-2">{weekPill}</div>}
            headerEndSlot={headerControls}
          />
        ) : (
          <div
            // `h-full` alongside `flex-1`: the pack/tech hosts lay this out in a
            // fixed-height BLOCK container (`h-[calc(100dvh-13rem)]`), where
            // `flex-1` resolves to nothing and the box grows to content — which
            // collapses the virtualizer's viewport measurement and renders an
            // empty grid. `h-full` bounds it under a block parent; `flex-1`
            // still governs under a flex one. (The legacy StationWeekTable used
            // `h-full` for exactly this reason.)
            className="relative flex h-full min-h-0 flex-1 flex-col outline-none"
            tabIndex={0}
            onKeyDown={onKeyDown}
            aria-label="Station records"
          >
            <NonlinearTableHost<QueueRowRecord, OrdersQueueColumnKey, OrdersQueueColumn>
              binding={STATION_HISTORY_TABLE_BINDING}
              tableId={tableId}
              ariaLabel="Station records"
              orderGroupsByDate={orderGroupsByDate}
              rows={queueRows}
              getRowId={(row) => {
                const source = getStationSourceRecord<T>(row);
                return String(source ? selection.getRecordId(source) : row.id);
              }}
              loading={loading}
              emptyMessage={emptyMessage}
              emptyState={firstRunEmpty}
              sort={null}
              dir={null}
              onSortChange={() => {}}
              scrollToKey={focusedKey}
              columnTriggerPortalTarget={null}
              renderColumnHeader={({ toggleColumnSort, onResizeColumn, onResetColumn, columns }) => (
                <OrdersQueueColumnHeader
                  selectionScope={selection.scope}
                  columns={columns}
                  activeSort={null}
                  sortDir={null}
                  onSortColumn={toggleColumnSort}
                  onResizeColumn={onResizeColumn}
                  onResetColumn={onResetColumn}
                />
              )}
              renderGroup={(group, stripe, { columns }) =>
                renderQueueRow(group.rows[0], stripe, columns)
              }
              renderRow={(row, stripe, { columns }, rowIndex) =>
                renderQueueRow(row, stripe, columns, rowIndex)
              }
            />
            {bulkBar}
          </div>
        )}
      </TableDensityProvider>
    </TableColumnConfigProvider>
  );
}
