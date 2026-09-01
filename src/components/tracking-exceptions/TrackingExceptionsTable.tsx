'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/design-system/primitives';
import { DataTable } from '@/components/tables/DataTable';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import type { RowGroup } from '@/lib/group-rows';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

import { TrackingExceptionEditDialog } from './TrackingExceptionEditDialog';
import { TRACKING_EXCEPTIONS_TABLE_BINDING } from './grid/tracking-exceptions-table-definition';
import { useTrackingExceptionsTableLayout } from './grid/useTrackingExceptionsTableLayout';
import { TrackingExceptionsGridRow } from './grid/TrackingExceptionsGridRow';
import {
  defaultDirForTrackingExceptionsColumn,
  isTrackingExceptionsColumnSortable,
  trackingExceptionsSheetColumnsFor,
  trackingExceptionsSortFactFor,
  type TrackingExceptionsGridColumn,
  type TrackingExceptionsGridColumnKey,
} from './grid/tracking-exceptions-grid-layout';
import {
  trackingExceptionCarrier,
  trackingExceptionStaffLabel,
  type TrackingExceptionRow,
  type TrackingExceptionStatusFilter,
} from './types';
import { useTrackingExceptions } from './useTrackingExceptions';

/**
 * Row order for a column sort. `lastCheck` with a null instant sorts LAST in
 * both directions — "never checked" is unknown, not oldest and not newest.
 */
function compareTrackingExceptionRows(
  a: TrackingExceptionRow,
  b: TrackingExceptionRow,
  fact: string,
  dir: GridSortDir,
): number {
  const sign = dir === 'asc' ? 1 : -1;
  switch (fact) {
    case 'title':
      return sign * a.tracking_number.localeCompare(b.tracking_number);
    case 'tracking-exceptions.carrier':
      return sign * trackingExceptionCarrier(a).localeCompare(trackingExceptionCarrier(b));
    case 'tracking-exceptions.source':
      return sign * (a.source_station || '').localeCompare(b.source_station || '');
    case 'tracking-exceptions.staff':
      return sign * trackingExceptionStaffLabel(a).localeCompare(trackingExceptionStaffLabel(b));
    case 'tracking-exceptions.reason':
      return sign * a.exception_reason.localeCompare(b.exception_reason);
    case 'tracking-exceptions.status':
      return sign * a.status.localeCompare(b.status);
    case 'tracking-exceptions.retries':
      return sign * (a.zoho_check_count - b.zoho_check_count);
    case 'tracking-exceptions.last_check': {
      if (!a.last_zoho_check_at && !b.last_zoho_check_at) return 0;
      if (!a.last_zoho_check_at) return 1;
      if (!b.last_zoho_check_at) return -1;
      return sign * a.last_zoho_check_at.localeCompare(b.last_zoho_check_at);
    }
    case 'tracking-exceptions.created':
      return sign * a.created_at.localeCompare(b.created_at);
    case 'tracking-exceptions.notes':
      return sign * (a.notes || '').localeCompare(b.notes || '');
    default:
      return 0;
  }
}

/**
 * The status vocabulary — lives in the ONE filter control (operator ruling
 * 2026-08-30: selection tabs are filters). `all` is deliberately absent: it is
 * the ABSENCE of a status filter; picking the active option clears back to it.
 */
const STATUS_OPTIONS: Array<{ id: TrackingExceptionStatusFilter; label: string }> = [
  { id: 'open', label: 'Open' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'discarded', label: 'Discarded' },
];

/**
 * Data host over the Tracking Exceptions Workbench spreadsheet — mounts
 * `NonlinearTableHost` + the tracking-exceptions table definition directly.
 *
 * Status tabs · search · reload · edit dialog stay here; the grid is the
 * display map only. A failed fetch earns the retryable error state rather than
 * an empty grid that would read as "no exceptions"
 * (`display/workbench.md` settled states).
 */
export function TrackingExceptionsTable() {
  const [statusTab, setStatusTab] = useState<TrackingExceptionStatusFilter>('open');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<TrackingExceptionRow | null>(null);
  // ▦ portals into Band-3 controls beside find / reload.

  const {
    rows,
    total,
    loading,
    error,
    refreshingIds,
    fetchRows,
    refreshRow,
    saveRow,
    deleteRow,
  } = useTrackingExceptions(statusTab, search);

  const scrollRef = useRef<HTMLDivElement>(null);

  // The COLUMNS are the effective slot layout's materialization (staff ?? org
  // ?? product — wave 1.4 hand-model kill). Sort keys are the mounted track
  // keys; each resolves to its bound field's fact.
  const { effectiveLayout: exceptionsLayout, fields: trackingExceptionsFields } =
    useTrackingExceptionsTableLayout();
  const columns = useMemo(
    () => trackingExceptionsSheetColumnsFor(exceptionsLayout),
    [exceptionsLayout],
  );
  const sortFactByKey = useMemo(
    () => new Map(columns.map((c) => [c.key as string, trackingExceptionsSortFactFor(c)])),
    [columns],
  );

  const {
    sort: columnSort,
    dir: sortDir,
    setSort,
  } = useUrlColumnSort<TrackingExceptionsGridColumnKey>({
    isColumn: (raw) => isTrackingExceptionsColumnSortable(columns, raw),
    defaultDir: (key) => defaultDirForTrackingExceptionsColumn(columns, key),
  });

  // One-shot settle re-render after first data — the virtualized LedgerGrid can
  // otherwise miss its scrollport on first paint when nothing else re-renders.
  const [, settleTick] = useState(0);
  const hasRows = rows.length > 0;
  useEffect(() => {
    if (loading || !hasRows) return;
    const raf = requestAnimationFrame(() => settleTick((t) => t + 1));
    return () => cancelAnimationFrame(raf);
  }, [loading, hasRows]);

  const orderGroupsByDate = useMemo<[string, RowGroup<TrackingExceptionRow>[]][]>(() => {
    const sortFact = columnSort ? (sortFactByKey.get(columnSort) ?? null) : null;
    const ordered =
      sortFact && sortDir
        ? [...rows].sort((a, b) => compareTrackingExceptionRows(a, b, sortFact, sortDir))
        : rows;
    // One unnamed band — the triage queue has no day/fold axis.
    return [['', ordered.map((row) => ({ key: `exc:${row.id}`, rows: [row] }))]];
  }, [rows, columnSort, sortFactByKey, sortDir]);

  const renderLeaf = (
    row: TrackingExceptionRow,
    visible: readonly TrackingExceptionsGridColumn[],
  ) => (
    <TrackingExceptionsGridRow
      key={row.id}
      row={row}
      isSelected={row.id === (editing?.id ?? null)}
      refreshing={refreshingIds.has(row.id)}
      onOpenEdit={setEditing}
      onRefresh={(r) => void refreshRow(r)}
      columns={visible}
    />
  );

  if (error && rows.length === 0 && !loading) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex flex-1 items-center justify-center bg-surface-canvas p-8">
          <div className="rounded-xl border border-dashed border-border-danger bg-surface-danger px-4 py-6 text-center">
            <p className="text-sm font-semibold text-text-danger">{error}</p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="mt-3"
              onClick={() => void fetchRows()}
            >
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {error ? (
        <div className="border-b border-red-200 bg-red-50 px-6 py-2 text-role-caption font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-canvas">
        <DataTable<
          TrackingExceptionRow,
          TrackingExceptionsGridColumnKey,
          TrackingExceptionsGridColumn
        >
          binding={TRACKING_EXCEPTIONS_TABLE_BINDING}
          columns={columns}
          fields={trackingExceptionsFields}
          orderGroupsByDate={orderGroupsByDate}
          rows={rows}
          getRowId={(r) => String(r.id)}
          sort={columnSort}
          dir={sortDir}
          onSortChange={setSort}
          loading={loading}
          emptyMessage="No exceptions in this view."
          searchEmptyMessage="No exceptions match this search."
          scrollRef={scrollRef}
          search={{ value: search, onChange: setSearch, placeholder: 'Search tracking…' }}
          filter={{
            options: STATUS_OPTIONS.map((o) => ({ ...o, active: statusTab === o.id })),
            onToggle: (id) =>
              setStatusTab(
                id === statusTab ? 'all' : (id as TrackingExceptionStatusFilter),
              ),
            onClearAll: () => setStatusTab('all'),
          }}
          totalCount={total}
          renderGroup={(group, _stripe, { columns: visible }) => (
            <>{group.rows.map((row) => renderLeaf(row, visible))}</>
          )}
          renderRow={(row, _stripe, { columns: visible }) => renderLeaf(row, visible)}
        />
      </div>

      {editing ? (
        <TrackingExceptionEditDialog
          row={editing}
          onClose={() => setEditing(null)}
          onSave={async (row, patch) => {
            await saveRow(row, patch);
            setEditing(null);
          }}
          onDelete={async (row) => {
            await deleteRow(row);
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}
