'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { StationListTable } from '@/components/station/StationListTable';
import {
  TableStatusBar,
  type DataTableTabStrip,
} from '@/components/tables/TableStatusBar';
import { StationPipelineBoard } from '@/components/station/StationPipelineBoard';
import { StationQueueRow } from '@/components/station/StationQueueRow';
import { STATION_HISTORY_GRID_CAPABILITIES } from '@/components/station/station-history-capabilities';
import { Copy, X } from '@/components/Icons';
import { emitToggleAll } from '@/lib/selection/table-selection';
import { useTableSelectMode } from '@/hooks/useTableSelectMode';
import { useUIModeOptional } from '@/design-system/providers/UIModeProvider';
import { ORDERS_QUEUE_COLUMNS, type OrdersQueueColumn } from '@/lib/dashboard-order-row-layout';
import { toTsvBlock } from '@/lib/station/format-station-copy-row';
import { getStationSourceRecord, type StationSourceKind } from '@/lib/station/record-to-queue-row';
import type { QueueRowRecord } from '@/components/dashboard/orders-queue/helpers';
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
 * windowing, the week band, the ⋮ menu (row density + saved views), bulk
 * select, and a typed first-run empty.
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
  /** Saved-views storage + params for the ⋮ menu. */
  savedViewsStorageKey: string;
  savedViewsParamKeys: readonly string[];
  emptyMessage: string;
  /** Teaching first-run empty (zero rows, no active filter). */
  firstRunEmpty?: ReactNode;
  /** Portal display controls into the owning workspace chrome. */
  /** The desk's mode strip, drawn on this table's own status bar. */
  tabStrip?: DataTableTabStrip;
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
  isRefreshing,
  weekRange,
  weekOffset,
  onPrevWeek,
  onNextWeek,
  onResetWeek,
  daySections,
  getRowKey,
  tableId,
  savedViewsStorageKey,
  savedViewsParamKeys,
  emptyMessage,
  firstRunEmpty,
  tabStrip,
  pipeline,
  selection,
}: StationHistoryTableProps<T>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isMobile } = useUIModeOptional();
  const totalCount = sumDaySectionCounts(daySections);

  // Per-staff visible tracks for the converged station rows. The ⋮ menu below
  // writes `staff_preferences.tableColumns[tableId].hidden`; resolving it ONCE
  // here (instead of per cell inside the row, as `useIsColumnHidden` used to)
  // is what makes a hidden column lose its whole track — header, body and grid
  // template all read this one list.
  // Every staffer sees the same tracks: the per-staff hide/show delta went with
  // the column rail on 2026-08-29. The model IS what the table draws.
  const visibleColumns: readonly OrdersQueueColumn[] = ORDERS_QUEUE_COLUMNS;

  // Reconnect-only broad invalidate (the hot path is Ably/local cache patches).
  useStationReconnectSync();

  // ── Bulk select + keyboard focus ──────────────────────────────────────────
  // Always on — left gutter ☐, no week-band pencil.
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const orderedRecords = useMemo(() => daySections.flatMap(([, recs]) => recs), [daySections]);
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

  // Map each record → queue-row shape and render the shared OrdersQueueTableRow
  // (checkbox + serial chip) — the same row the outbound Queue grid uses.
  const renderRow = useCallback(
    (record: T, index: number, rowIndex?: number) => {
      const id = selection.getRecordId(record);
      return (
        <StationQueueRow
          record={selection.toQueueRow(record)}
          index={index}
          rowIndex={rowIndex}
          queueMode={selection.queueMode}
          selectMode
          isChecked={selectedIds.has(id)}
          isSelected={focusedId === id}
          isMobile={isMobile}
          columns={visibleColumns}
          onToggleSelect={(event) => toggle(id, event.shiftKey)}
          onRowClick={(mapped) => {
            const source = getStationSourceRecord<T>(mapped) ?? record;
            selection.onOpen(source);
          }}
        />
      );
    },
    [selection, selectedIds, isMobile, visibleColumns, toggle],
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

  const weekPill = (
    <DateRangePickerPill
      label={formatWeekRangeCompact(weekRange.startStr, weekRange.endStr)}
      count={totalCount}
      weekNav={{ weekOffset, onPrev: onPrevWeek, onNext: onNextWeek }}
    />
  );
  return (
    <>
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
            role="grid"
            aria-label="Station records"
          >
            <StationListTable<T>
              loading={loading}
              isRefreshing={isRefreshing}
              weekRange={weekRange}
              weekOffset={weekOffset}
              onPrevWeek={onPrevWeek}
              onNextWeek={onNextWeek}
              onResetWeek={onResetWeek}
              showWeekControls

              daySections={daySections}
              totalCount={totalCount}
              renderRow={renderRow}
              getRowKey={getRowKey}
              virtualized
              scrollToKey={focusedKey}
              emptyMessage={emptyMessage}
              firstRunEmpty={firstRunEmpty}
              capabilities={STATION_HISTORY_GRID_CAPABILITIES}
            />
            <TableStatusBar
              {...tabStrip}
              shown={totalCount}
              selected={selectedCount}
              onCopySelection={() => void copySelected()}
            />
          </div>
        )}
    </>
  );
}
