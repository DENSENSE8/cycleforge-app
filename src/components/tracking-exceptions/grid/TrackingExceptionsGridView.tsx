'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { LedgerGridSurface } from '@/design-system/components/grid';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import type { RowGroup } from '@/lib/group-rows';
import {
  trackingExceptionCarrier,
  trackingExceptionStaffLabel,
  type TrackingExceptionRow,
} from '../types';
import { makeTrackingExceptionsGridDescriptor } from './tracking-exceptions-grid-descriptor';
import { TrackingExceptionsGridColumnHeader } from './TrackingExceptionsGridColumnHeader';
import { TrackingExceptionsGridRow } from './TrackingExceptionsGridRow';
import {
  TRACKING_EXCEPTIONS_GRID_COLUMNS,
  defaultDirForTrackingExceptionsGridSort,
  isTrackingExceptionsGridSortable,
  type TrackingExceptionsGridColumn,
  type TrackingExceptionsGridColumnKey,
} from './tracking-exceptions-grid-layout';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

/** Staff-prefs identity — one Tracking Exceptions spreadsheet, one Fields selection. */
const TRACKING_EXCEPTIONS_TABLE_ID = 'tracking-exceptions' as const;

interface TrackingExceptionsGridViewProps {
  rows: TrackingExceptionRow[];
  loading: boolean;
  /** Settled with no exceptions at all in this status view. */
  emptyMessage: string;
  /** Settled with none matching the search — a different answer (clear it). */
  searchEmptyMessage?: string;
  isSearching?: boolean;
  /** Row currently open at the record plane (edit dialog). */
  editingId: number | null;
  refreshingIds: ReadonlySet<number>;
  onOpenEdit: (row: TrackingExceptionRow) => void;
  onRefresh: (row: TrackingExceptionRow) => void;
  /** FULL canonical column list — `LedgerGridSurface` resolves visibility. */
  columns?: readonly TrackingExceptionsGridColumn[];
}

/**
 * Row order for a column sort.
 *
 * `lastCheck` with a null instant sorts LAST in both directions — "never
 * checked" is unknown, not oldest and not newest.
 */
function compareTrackingExceptionRows(
  a: TrackingExceptionRow,
  b: TrackingExceptionRow,
  key: TrackingExceptionsGridColumnKey,
  dir: GridSortDir,
): number {
  const sign = dir === 'asc' ? 1 : -1;
  switch (key) {
    case 'title':
      return sign * a.tracking_number.localeCompare(b.tracking_number);
    case 'carrier':
      return sign * trackingExceptionCarrier(a).localeCompare(trackingExceptionCarrier(b));
    case 'source':
      return sign * (a.source_station || '').localeCompare(b.source_station || '');
    case 'staff':
      return sign * trackingExceptionStaffLabel(a).localeCompare(trackingExceptionStaffLabel(b));
    case 'reason':
      return sign * a.exception_reason.localeCompare(b.exception_reason);
    case 'status':
      return sign * a.status.localeCompare(b.status);
    case 'retries':
      return sign * (a.zoho_check_count - b.zoho_check_count);
    case 'lastCheck': {
      if (!a.last_zoho_check_at && !b.last_zoho_check_at) return 0;
      if (!a.last_zoho_check_at) return 1;
      if (!b.last_zoho_check_at) return -1;
      return sign * a.last_zoho_check_at.localeCompare(b.last_zoho_check_at);
    }
    case 'created':
      return sign * a.created_at.localeCompare(b.created_at);
    case 'notes':
      return sign * (a.notes || '').localeCompare(b.notes || '');
    default:
      return 0;
  }
}

/**
 * Tracking Exceptions spreadsheet — ops-native adapter over
 * {@link LedgerGridSurface}. Flat triage queue: no fold, no day band.
 *
 * Display map only. Filters + mutations live in the thin host; this owns
 * URL-durable sort and row chrome (`LedgerGridSurface` resolves visibility).
 */
export function TrackingExceptionsGridView({
  rows,
  loading,
  emptyMessage,
  searchEmptyMessage,
  isSearching,
  editingId,
  refreshingIds,
  onOpenEdit,
  onRefresh,
  columns = TRACKING_EXCEPTIONS_GRID_COLUMNS,
}: TrackingExceptionsGridViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Column sort is DURABLE: `?colsort=`/`?coldir=` (workbench URL-as-state law).
  const {
    sort: columnSort,
    dir: sortDir,
    setSort,
  } = useUrlColumnSort<TrackingExceptionsGridColumnKey>({
    isColumn: isTrackingExceptionsGridSortable,
    defaultDir: defaultDirForTrackingExceptionsGridSort,
  });

  // One-shot settle re-render after first data — see PickupGridView / WarrantyGridView.
  const [, settleTick] = useState(0);
  const hasRows = rows.length > 0;
  useEffect(() => {
    if (loading || !hasRows) return;
    const raf = requestAnimationFrame(() => settleTick((t) => t + 1));
    return () => cancelAnimationFrame(raf);
  }, [loading, hasRows]);

  const orderGroupsByDate = useMemo<[string, RowGroup<TrackingExceptionRow>[]][]>(() => {
    const ordered =
      columnSort && sortDir
        ? [...rows].sort((a, b) => compareTrackingExceptionRows(a, b, columnSort, sortDir))
        : rows;
    // One unnamed band — the triage queue has no day/fold axis.
    return [['', ordered.map((row) => ({ key: `exc:${row.id}`, rows: [row] }))]];
  }, [rows, columnSort, sortDir]);

  const renderLeaf = (
    row: TrackingExceptionRow,
    visible: readonly TrackingExceptionsGridColumn[],
  ) => (
    <TrackingExceptionsGridRow
      key={row.id}
      row={row}
      isSelected={row.id === editingId}
      refreshing={refreshingIds.has(row.id)}
      onOpenEdit={onOpenEdit}
      onRefresh={onRefresh}
      columns={visible}
    />
  );

  return (
    <LedgerGridSurface<
      TrackingExceptionRow,
      TrackingExceptionsGridColumnKey,
      TrackingExceptionsGridColumn
    >
      ariaLabel="Tracking exceptions"
      surface="sheet"
      columns={columns}
      makeDescriptor={makeTrackingExceptionsGridDescriptor}
      orderGroupsByDate={orderGroupsByDate}
      rows={rows}
      getRowId={(r) => String(r.id)}
      sort={columnSort}
      dir={sortDir}
      onSortChange={setSort}
      loading={loading}
      emptyMessage={emptyMessage}
      searchEmptyMessage={searchEmptyMessage}
      isSearching={isSearching}
      scrollRef={scrollRef}
      testId="tracking-exceptions-grid-body"
      tableId={TRACKING_EXCEPTIONS_TABLE_ID}
      renderColumnHeader={({ toggleColumnSort, onResizeColumn, onResetColumn, columns: visible }) => (
        <TrackingExceptionsGridColumnHeader
          columns={visible}
          activeSort={columnSort}
          sortDir={sortDir}
          onSortColumn={toggleColumnSort}
          onResizeColumn={onResizeColumn}
        onResetColumn={onResetColumn}
        />
      )}
      renderGroup={(group, _stripe, { columns: visible }) => (
        <>{group.rows.map((row) => renderLeaf(row, visible))}</>
      )}
      renderRow={(row, _stripe, { columns: visible }) => renderLeaf(row, visible)}
    />
  );
}
