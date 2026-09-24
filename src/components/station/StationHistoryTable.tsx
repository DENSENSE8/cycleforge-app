'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { StationPipelineBoard } from '@/components/station/StationPipelineBoard';
import { DataTable } from '@/components/tables/DataTable';
import {
  useBenchSpreadsheet,
  type BenchFamily,
} from '@/components/station/bench-grid/useBenchSpreadsheet';
import type { SlotTableLayout } from '@/components/tables/useSlotTableLayout';
import { getStationSourceRecord, type StationSourceKind } from '@/lib/station/record-to-queue-row';
import type { QueueRowRecord } from '@/components/dashboard/orders-queue/helpers';
import type { OrdersQueueColumn, OrdersQueueColumnKey } from '@/lib/dashboard-order-row-layout';
import type { SwimlaneLaneDef } from '@/components/board/SwimlaneBoard';
import type { BoardPrefsKey } from '@/lib/neon/staff-preferences-queries';
import type { WeekRange } from '@/components/dashboard/orders-queue/helpers';
import type { RowGroup } from '@/lib/group-rows';
import { sumDaySectionCounts } from '@/components/station/station-table-logic';
import { STATION_PIPELINE_BOARDS } from '@/lib/station/flags';
import { LAYOUT_PARAM, parseLayout, type StationLayout } from '@/lib/station/table-url-params';
import { useStationReconnectSync } from '@/hooks/station/useStationReconnectSync';
import { DateRangePickerPill } from '@/components/ui/DateRangeHeader';
import { formatWeekRangeCompact, toPSTDateKey } from '@/utils/date';

/**
 * `StationHistoryTable<T>` — the Tech / Packer bench history desk.
 *
 * Wave C of the slot-table SoT port: this was the last THIRD display engine.
 * It used to render `StationQueueRow` (a per-family row component wrapping
 * `OrdersQueueTableRow` over the hand `STATION_HISTORY_COLUMNS` array) inside
 * `StationListTable`'s raw `LedgerGrid` — a table outside `PRODUCT_TABLES` and
 * `REGISTERED_BINDINGS`, with its own week band, its own bulk bar and its own
 * copy pill. `tech` and `packer` are now registered families on the ONE engine:
 * the desk mounts {@link DataTable} with the feed from
 * {@link useBenchSpreadsheet}, so the benches get header click-to-sort, the
 * filter funnel, a Fields picker, saved views that capture columns, the shared
 * selection gutter and selection-copy — none of it declared here.
 *
 * What this component still owns is genuinely the desk's, not the table's: the
 * WEEK the query covers (portaled into the workspace chrome), the optional
 * pipeline board, keyboard row focus and the `?techLogId=` deep link.
 */
export interface StationHistoryTableProps<T> {
  loading: boolean;
  weekRange: WeekRange;
  weekOffset: number;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onResetWeek?: () => void;
  /** `[date, records]` bands, newest day first, each day's rows pre-sorted. */
  daySections: [string, T[]][];
  /** Which registered bench family paints — selects binding · columns · resolver. */
  family: BenchFamily;
  /**
   * The caller's own slot layout (`useTechTableLayout` / `usePackerTableLayout`).
   * Passed in rather than resolved here so each desk pays for one prefs read
   * and this component branches on data, never on hooks.
   */
  layout: SlotTableLayout;
  /** Saved-views storage + params. DataTable mounts the menu. */
  savedViewsStorageKey: string;
  savedViewsParamKeys: readonly string[];
  emptyMessage: string;
  /** Teaching first-run empty (zero rows, no active filter). */
  firstRunEmpty?: ReactNode;
  /** Portal the week pill into the owning workspace chrome. */
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
  /**
   * The find box, ANSWERED BY THE SERVER. The desk's controller owns the text
   * because only the controller can spend it on the fetch key — a bench feed
   * arrives windowed, so a value filtered in React here would search the
   * newest page and call the rest of the week absent.
   *
   * `pending` is the controller's `isFetching` for the CURRENT value: it
   * lights the field spinner and holds the body in its loading face, so the
   * operator never reads a stale row set as the answer to what they just typed.
   */
  search: {
    value: string;
    onChange: (value: string) => void;
    pending: boolean;
  };
}

export function StationHistoryTable<T>({
  loading,
  weekRange,
  weekOffset,
  onPrevWeek,
  onNextWeek,
  daySections,
  family,
  layout,
  savedViewsStorageKey,
  savedViewsParamKeys,
  emptyMessage,
  firstRunEmpty,
  toolbarPortalTarget,
  pipeline,
  selection,
  search,
}: StationHistoryTableProps<T>) {
  const searchParams = useSearchParams();
  const totalCount = sumDaySectionCounts(daySections);

  // Reconnect-only broad invalidate (the hot path is Ably/local cache patches).
  useStationReconnectSync();

  const [focusedId, setFocusedId] = useState<number | null>(null);
  const orderedRecords = useMemo(() => daySections.flatMap(([, recs]) => recs), [daySections]);

  /**
   * The domain record behind a mapped row, by row id — how copy and row-open
   * recover the `TechRecord` / `PackerRecord` without a second fetch.
   */
  const sourceById = useMemo(() => {
    const map = new Map<string, T>();
    for (const record of orderedRecords) map.set(String(selection.getRecordId(record)), record);
    return map;
  }, [orderedRecords, selection]);

  const rows = useMemo(
    () => orderedRecords.map((record) => selection.toQueueRow(record)),
    [orderedRecords, selection],
  );

  const handleOpenRow = useCallback(
    (row: QueueRowRecord) => {
      const source = getStationSourceRecord<T>(row) ?? sourceById.get(String(row.id));
      if (source) selection.onOpen(source);
    },
    [selection, sourceById],
  );

  const feed = useBenchSpreadsheet({
    family,
    layout,
    rows,
    loading,
    emptyMessage,
    onOpenRow: handleOpenRow,
    search,
  });

  /**
   * Day bands over the FED rows, so search and column sort narrow the bands
   * instead of fighting them. The engine's own grouping is a single band; a
   * bench reads as a diary, so the date band is the desk's contribution.
   */
  const dayGroups = useMemo(() => {
    const byDay = new Map<string, QueueRowRecord[]>();
    for (const row of feed.rows) {
      let key = 'Unknown';
      try {
        key = toPSTDateKey(row.created_at as string) || 'Unknown';
      } catch {
        key = 'Unknown';
      }
      const bucket = byDay.get(key);
      if (bucket) bucket.push(row);
      else byDay.set(key, [row]);
    }
    return [...byDay.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, dayRows]) => [
        date,
        dayRows.map((row) => ({ key: `k:${row.id}`, rows: [row] })),
      ]) as [string, RowGroup<QueueRowRecord>[]][];
  }, [feed.rows]);

  /**
   * Selection copy keeps the bench's own TSV vocabulary
   * (`format-station-copy-row`), which is written against the DOMAIN record —
   * so the cells come from splitting that line rather than from a second
   * column list that could drift from it.
   */
  const copyExport = useMemo(
    () => ({
      columns: selection.copyHeader,
      toRow: (row: QueueRowRecord) => {
        const source = getStationSourceRecord<T>(row) ?? sourceById.get(String(row.id));
        return source ? selection.formatCopyRow(source).split('\t') : [];
      },
    }),
    [selection, sourceById],
  );

  // Deep link: focus the row named by the URL param (?techLogId=…).
  const deepLinkValue = selection.deepLinkParam ? searchParams.get(selection.deepLinkParam) : null;
  useEffect(() => {
    if (!deepLinkValue) return;
    const targetId = Number(deepLinkValue);
    if (
      Number.isFinite(targetId) &&
      orderedRecords.some((r) => selection.getRecordId(r) === targetId)
    ) {
      setFocusedId(targetId);
    }
  }, [deepLinkValue, selection, orderedRecords]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (orderedRecords.length === 0) return;
      const curIdx =
        focusedId == null
          ? -1
          : orderedRecords.findIndex((r) => selection.getRecordId(r) === focusedId);
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
  const layoutMode: StationLayout = boardEnabled ? parseLayout(searchParams.get(LAYOUT_PARAM)) : 'all';

  const weekPill = (
    <DateRangePickerPill
      label={formatWeekRangeCompact(weekRange.startStr, weekRange.endStr)}
      count={totalCount}
      weekNav={{ weekOffset, onPrev: onPrevWeek, onNext: onNextWeek }}
    />
  );
  // House chrome recipe (Unbox · Shipped · FBA · Testing history): the period
  // pill rides in the workbench chrome controls slot, so the table itself is a
  // plain framed card with no second header band inside it.
  const portaledControls = toolbarPortalTarget
    ? createPortal(<div className="flex items-center gap-2">{weekPill}</div>, toolbarPortalTarget)
    : null;

  /**
   * Board lane rows. The pipeline board is a different display KIND (lanes, not
   * a table), so it keeps its own list body; the row it paints is the engine's
   * compound row, from the same feed as the table.
   */
  const renderBoardRow = useCallback(
    (record: T, _index: number, rowIndex?: number): ReactNode => {
      const row = selection.toQueueRow(record);
      return feed.renderRow?.(row, rowIndex ?? 0, {
        columns: (feed.columns ?? []) as readonly OrdersQueueColumn[],
      });
    },
    [feed, selection],
  );

  if (boardEnabled && layoutMode === 'board' && pipeline) {
    return (
      <>
        {portaledControls}
        <StationPipelineBoard<T, string>
          prefsKey={pipeline.prefsKey}
          lanes={pipeline.lanes}
          bucket={pipeline.bucket}
          records={pipeline.records}
          loading={loading}
          renderRow={renderBoardRow}
          toDaySections={pipeline.toDaySections}
          getRowDate={pipeline.getRowDate}
          headerStartSlot={<div className="flex items-center gap-2">{weekPill}</div>}
        />
      </>
    );
  }

  return (
    <>
      {portaledControls}
      <div
        // `h-full` alongside `flex-1`: the pack/tech hosts lay this out in a
        // fixed-height BLOCK container (`h-[calc(100dvh-13rem)]`), where
        // `flex-1` resolves to nothing and the box grows to content — which
        // collapses the virtualizer's viewport measurement and renders an
        // empty grid. `h-full` bounds it under a block parent; `flex-1` still
        // governs under a flex one.
        className="relative flex h-full min-h-0 flex-1 flex-col outline-none"
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        <DataTable<QueueRowRecord, OrdersQueueColumnKey, OrdersQueueColumn>
          {...feed}
          orderGroupsByDate={dayGroups}
          totalCount={totalCount}
          selectionScope={selection.scope}
          copyExport={copyExport}
          emptyState={firstRunEmpty}
          views={{
            storageKey: savedViewsStorageKey,
            paramKeys: savedViewsParamKeys,
            layout: layout.effectiveLayout,
          }}
        />
      </div>
    </>
  );
}
