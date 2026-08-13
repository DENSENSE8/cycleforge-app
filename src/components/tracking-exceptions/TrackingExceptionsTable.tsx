'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/design-system/primitives';
import {
  WorkbenchSheetView,
  useWorkbenchSheetChrome,
} from '@/components/dashboard/WorkbenchSheetView';
import {
  WorkbenchChromeHeader,
  WorkbenchTrailingCluster,
  WorkbenchTriageBand,
} from '@/components/dashboard/workbench-shell';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import { NonlinearTableHost } from '@/components/tables/NonlinearTableHost';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import type { RowGroup } from '@/lib/group-rows';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import { TrackingExceptionEditDialog } from './TrackingExceptionEditDialog';
import { TRACKING_EXCEPTIONS_TABLE_BINDING } from './grid/tracking-exceptions-table-definition';
import { TrackingExceptionsGridColumnHeader } from './grid/TrackingExceptionsGridColumnHeader';
import { TrackingExceptionsGridRow } from './grid/TrackingExceptionsGridRow';
import {
  defaultDirForTrackingExceptionsGridSort,
  isTrackingExceptionsGridSortable,
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

const STATUS_TABS: Array<{ id: TrackingExceptionStatusFilter; label: string }> = [
  { id: 'open', label: 'Open' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'discarded', label: 'Discarded' },
  { id: 'all', label: 'All' },
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
  const chrome = useWorkbenchSheetChrome();

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
  const {
    sort: columnSort,
    dir: sortDir,
    setSort,
  } = useUrlColumnSort<TrackingExceptionsGridColumnKey>({
    isColumn: isTrackingExceptionsGridSortable,
    defaultDir: defaultDirForTrackingExceptionsGridSort,
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
      isSelected={row.id === (editing?.id ?? null)}
      refreshing={refreshingIds.has(row.id)}
      onOpenEdit={setEditing}
      onRefresh={(r) => void refreshRow(r)}
      columns={visible}
    />
  );

  // Search is the only refinement that changes the empty answer — status tabs
  // still mean "nothing in this view", not "clear your search".
  const isSearching = Boolean(search.trim());
  const emptyError = Boolean(error && rows.length === 0 && !loading);

  return (
    <>
      <WorkbenchSheetView
        chrome={chrome}
        className="h-full"
        tabs={({ className }) => (
          <WorkbenchChromeHeader
            density="band"
            tabs={STATUS_TABS}
            activeTab={statusTab}
            onTabChange={(id) => setStatusTab(id as TrackingExceptionStatusFilter)}
            trailing={
              <WorkbenchTrailingCluster
                actions={
                  <Button
                    type="button"
                    size="sm"
                    variant="brand"
                    onClick={() => void fetchRows()}
                    disabled={loading}
                    aria-label="Reload list"
                  >
                    {loading ? 'Loading…' : 'Reload'}
                  </Button>
                }
              />
            }
            className={className}
          />
        )}
        triage={({ controlsSlotRef }) => (
          <WorkbenchTriageBand
            controlsSlotRef={controlsSlotRef}
            search={
              <TechRailSearchBar
                variant="chrome"
                value={search}
                onChange={setSearch}
                placeholder="Search tracking…"
                className="min-w-0 flex-1"
              />
            }
            right={
              <span className="text-role-micro uppercase tracking-widest text-text-soft">
                {total} rows
              </span>
            }
          />
        )}
      >
        {() =>
          emptyError ? (
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
          ) : (
            <>
              {error ? (
                <div className="border-b border-red-200 bg-red-50 px-6 py-2 text-role-caption font-semibold text-red-700">
                  {error}
                </div>
              ) : null}
              <NonlinearTableHost<
                TrackingExceptionRow,
                TrackingExceptionsGridColumnKey,
                TrackingExceptionsGridColumn
              >
          binding={TRACKING_EXCEPTIONS_TABLE_BINDING}
          orderGroupsByDate={orderGroupsByDate}
          rows={rows}
          getRowId={(r) => String(r.id)}
          sort={columnSort}
          dir={sortDir}
          onSortChange={setSort}
          loading={loading}
          emptyMessage="No exceptions in this view."
          searchEmptyMessage="No exceptions match this search."
          isSearching={isSearching}
          scrollRef={scrollRef}
          columnTriggerPortalTarget={null}
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
            </>
          )
        }
      </WorkbenchSheetView>

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
    </>
  );
}
