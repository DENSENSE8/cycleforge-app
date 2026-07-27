'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { StationListTable } from '@/components/station/StationListTable';
import { StationPipelineBoard } from '@/components/station/StationPipelineBoard';
import { StationQueueRow } from '@/components/station/StationQueueRow';
import { TableColumnConfigProvider } from '@/components/ui/table-column-config/TableColumnConfig';
import { TableDensityProvider } from '@/components/ui/table-density/TableDensityProvider';
import { TableOptionsMenu } from '@/components/ui/table-options/TableOptionsMenu';
import { Copy, X } from '@/components/Icons';
import { emitToggleAll } from '@/lib/selection/table-selection';
import { useTableSelectMode } from '@/hooks/useTableSelectMode';
import { useUIModeOptional } from '@/design-system/providers/UIModeProvider';
import { useGridColumnVisibility } from '@/design-system/components/grid';
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
 * `StationHistoryTable<T>` — the Phase-2 cutover shell for the Tech / Packer
 * history tables (station-table-unification-plan §Phase 2). It renders the
 * surface's OWN row (`TechRecordRow` / `PackerRecordRow`, unchanged — they already
 * use the shared `RowTitle`/`RowMetaColumns`/`ChipColumns` primitives) through the
 * unified {@link StationListTable}, so the benches gain windowing (behind
 * `NEXT_PUBLIC_STATION_VIRTUAL_LIST`), the week band, the ⋮ menu (row density +
 * saved views), and a typed first-run empty — while the legacy
 * `StationWeekTable` stays the default until bake-in.
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
  /** Render one row (the surface's own `TechRecordRow` / `PackerRecordRow`). */
  renderRow: (record: T, index: number) => ReactNode;
  /** Stable row key so windowing survives re-sorts. */
  getRowKey?: (record: T, index: number) => string;
  /** Per-staff column-config + density bag (`tech` | `packer`). */
  tableId: TableId;
  /** Window rows via the virtualizer (gate with `NEXT_PUBLIC_STATION_VIRTUAL_LIST`). */
  virtualized: boolean;
  /** Saved-views storage + params for the ⋮ menu. */
  savedViewsStorageKey: string;
  savedViewsParamKeys: readonly string[];
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
  /** Converged rendering + bulk select (Phase 7). When set, rows render through
   *  the shared `OrdersQueueTableRow` (via `StationQueueRow`) so they gain a
   *  checkbox + a copy-TSV bulk bar; the legacy `renderRow` is bypassed. */
  selection?: {
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
  renderRow,
  getRowKey,
  tableId,
  virtualized,
  savedViewsStorageKey,
  savedViewsParamKeys,
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

  // Per-staff visible tracks for the converged station rows. The ⋮ menu below
  // writes `staff_preferences.tableColumns[tableId].hidden`; resolving it ONCE
  // here (instead of per cell inside the row, as `useIsColumnHidden` used to)
  // is what makes a hidden column lose its whole track — header, body and grid
  // template all read this one list.
  const { columns: visibleColumns } = useGridColumnVisibility<OrdersQueueColumn>({
    columns: ORDERS_QUEUE_COLUMNS,
    tableId,
  });

  // Reconnect-only broad invalidate (the hot path is Ably/local cache patches).
  useStationReconnectSync();

  // ── Bulk select + keyboard focus (converged rendering only) ───────────────
  // Always-on when `selection` is provided — left gutter ☐, no week-band pencil.
  const selectMode = Boolean(selection);
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const orderedRecords = useMemo(() => daySections.flatMap(([, recs]) => recs), [daySections]);
  const getRecordId = useCallback(
    (r: T) => (selection ? selection.getRecordId(r) : 0),
    [selection],
  );
  const { selectedIds, toggle } = useTableSelectMode<T>({
    scope: selection?.scope ?? 'station-noop',
    selectMode,
    rows: orderedRecords,
    getId: getRecordId,
  });

  const copySelected = useCallback(async () => {
    if (!selection) return;
    const chosen = orderedRecords.filter((r) => selectedIds.has(selection.getRecordId(r)));
    if (chosen.length === 0) return;
    const block = toTsvBlock(selection.copyHeader, chosen.map(selection.formatCopyRow));
    try {
      await navigator.clipboard.writeText(block);
    } catch {
      /* clipboard blocked (permissions) — silently ignore */
    }
  }, [selection, orderedRecords, selectedIds]);

  // Converged renderRow: map each record → queue-row shape and render the shared
  // OrdersQueueTableRow (checkbox + serial chip). Falls back to the legacy renderRow.
  const convergedRenderRow = useCallback(
    (record: T, index: number) => {
      if (!selection) return renderRow(record, index);
      const id = selection.getRecordId(record);
      return (
        <StationQueueRow
          record={selection.toQueueRow(record)}
          index={index}
          queueMode={selection.queueMode}
          selectMode={selectMode}
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
    [selection, renderRow, selectMode, selectedIds, isMobile, visibleColumns, toggle],
  );

  const effectiveRenderRow = selection ? convergedRenderRow : renderRow;
  const selectedCount = selection ? orderedRecords.filter((r) => selectedIds.has(selection.getRecordId(r))).length : 0;

  // Keyboard focus → the row key to scroll to (works even when off-window).
  const focusedKey = useMemo(() => {
    if (focusedId == null || !selection || !getRowKey) return null;
    const rec = orderedRecords.find((r) => selection.getRecordId(r) === focusedId);
    return rec ? getRowKey(rec, 0) : null;
  }, [focusedId, orderedRecords, selection, getRowKey]);

  // Deep link: select + scroll to the row named by the URL param (?techLogId=…).
  const deepLinkValue = selection?.deepLinkParam ? searchParams.get(selection.deepLinkParam) : null;
  useEffect(() => {
    if (!selection || !deepLinkValue) return;
    const targetId = Number(deepLinkValue);
    if (Number.isFinite(targetId) && orderedRecords.some((r) => selection.getRecordId(r) === targetId)) {
      setFocusedId(targetId);
    }
  }, [deepLinkValue, selection, orderedRecords]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!selection || orderedRecords.length === 0) return;
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

  const optionsMenu = (
    <TableOptionsMenu
      layout={boardEnabled ? { value: layout, onChange: setLayout } : undefined}
      savedViews={{ storageKey: savedViewsStorageKey, paramKeys: savedViewsParamKeys }}
    />
  );
  const headerControls = (
    <div className="flex items-center gap-2">
      {toolbarPortalTarget ? null : optionsMenu}
    </div>
  );
  const portaledControls = toolbarPortalTarget
    ? createPortal(
        <div className="flex items-center gap-2">{optionsMenu}</div>,
        toolbarPortalTarget,
      )
    : null;

  // Bulk-action bar — pinned to the bottom of the table's relative region when
  // rows are selected. Copy-TSV + clear (Phase 7 §5.4).
  const bulkBar =
    selection && selectedCount > 0 ? (
      <div className="absolute inset-x-0 bottom-3 z-toast flex justify-center">
        <div className="flex items-center gap-2 rounded-full border border-border-soft bg-surface-card px-3 py-1.5 shadow-lg ring-1 ring-black/5">
          <span className="text-role-caption font-bold text-text-muted">{selectedCount} selected</span>
          {/* ds-raw-button: compact bulk-action capsule button */}
          <button
            type="button"
            onClick={() => void copySelected()}
            className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-2.5 py-1 text-role-caption font-bold text-white transition-colors hover:bg-blue-700"
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
            renderRow={effectiveRenderRow}
            getRowKey={getRowKey}
            toDaySections={pipeline.toDaySections}
            getRowDate={pipeline.getRowDate}
            headerStartSlot={
              <div className="flex items-center gap-2">
                <DateRangePickerPill
                  label={formatWeekRangeCompact(weekRange.startStr, weekRange.endStr)}
                  count={totalCount}
                  weekNav={{
                    weekOffset,
                    onPrev: onPrevWeek,
                    onNext: onNextWeek,
                  }}
                />
              </div>
            }
            headerEndSlot={headerControls}
          />
        ) : (
          <div
            className="relative flex min-h-0 flex-1 flex-col outline-none"
            tabIndex={selection ? 0 : undefined}
            onKeyDown={selection ? onKeyDown : undefined}
            role={selection ? 'grid' : undefined}
            aria-label={selection ? 'Station records' : undefined}
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
              renderRow={effectiveRenderRow}
              getRowKey={getRowKey}
              virtualized={virtualized}
              scrollToKey={focusedKey}
              headerEndSlot={headerControls}
              emptyMessage={emptyMessage}
              firstRunEmpty={firstRunEmpty}
            />
            {bulkBar}
          </div>
        )}
      </TableDensityProvider>
    </TableColumnConfigProvider>
  );
}
