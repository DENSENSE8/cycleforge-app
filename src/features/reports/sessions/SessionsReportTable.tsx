'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { DateRange } from 'react-day-picker';
import { DataTable, type DataTableFilterOption } from '@/components/tables/DataTable';
import { CompoundRow } from '@/components/tables/compound/CompoundRow';
import { compareGridValues } from '@/design-system/components/grid';
import { singleBand, type RowGroup } from '@/lib/group-rows';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import {
  SESSION_DAY_STATUS_LABEL,
  type SessionDayStatus,
} from '@/lib/sessions/session-day-fold';
import type { SessionDayIntervalRow, SessionDayRow } from '@/lib/sessions/session-day-report';
import { SCAN_SESSION_TYPES } from '@/lib/sessions/types';
import { sessionStationLabel } from '@/lib/sessions/session-page-nav';
import {
  defaultDirForSessionsGridSort,
  isSessionsSortFact,
  sessionsColumnKeyForSort,
  sessionsCompoundColumnsFor,
  sessionsSortFactFor,
  SESSIONS_SORT_FACT_TYPES,
  type SessionsGridColumn,
  type SessionsGridColumnKey,
  type SessionsSortFact,
} from '@/lib/sessions/sessions-grid-layout';
import { sessionsSlotValuesFor } from '@/lib/tables/field-catalog/sessions-resolve';
import {
  getCurrentPSTDateKey,
  localDateToDateKey,
  parseDateKey,
} from '@/utils/date';
import { SHEET_SAVED_VIEW_KEY } from '@/lib/saved-views/surfaces';
import { SessionDayInspector } from './SessionDayInspector';
import { sessionDayCompoundView } from './session-day-compound-view';
import { SESSIONS_GRID_CAPABILITIES } from './sessions-grid-descriptor';
import { SESSIONS_TABLE_BINDING } from './sessions-table-definition';
import { useSessionsTableLayout } from './useSessionsTableLayout';

const STATUS_IDS: readonly SessionDayStatus[] = ['armed', 'open', 'parked', 'ended'];

function dateKeyToLocalDate(key: string): Date | undefined {
  const parts = parseDateKey(key);
  if (!parts) return undefined;
  return new Date(parts.y, parts.m - 1, parts.d);
}

export function SessionsReportTable() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const todayKey = getCurrentPSTDateKey();
  const rawDate = searchParams.get('date');
  const dateKey = rawDate && parseDateKey(rawDate) ? rawDate : todayKey;
  const query = searchParams.get('q') ?? '';
  const statusFilter = STATUS_IDS.includes(searchParams.get('status') as SessionDayStatus)
    ? (searchParams.get('status') as SessionDayStatus)
    : null;
  const scanFilter = searchParams.get('scan');
  const rawStaff = searchParams.get('staff');
  const selectedStaffId = rawStaff && /^\d+$/.test(rawStaff) ? Number(rawStaff) : null;

  const { effectiveLayout, fields } = useSessionsTableLayout();
  const columns = useMemo(() => sessionsCompoundColumnsFor(effectiveLayout), [effectiveLayout]);

  const [rows, setRows] = useState<SessionDayRow[]>([]);
  const [intervals, setIntervals] = useState<SessionDayIntervalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const writeParams = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString());
      mutate(next);
      if (!next.get('tab')) next.set('tab', 'sessions');
      const qs = next.toString();
      router.replace(qs ? `/reports?${qs}` : '/reports');
    },
    [router, searchParams],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ date: dateKey });
      if (selectedStaffId != null) params.set('staff', String(selectedStaffId));
      const res = await fetch(`/api/sessions/daily?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || data?.success === false) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setIntervals(Array.isArray(data?.intervals) ? data.intervals : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setRows([]);
      setIntervals([]);
    } finally {
      setLoading(false);
    }
  }, [dateKey, selectedStaffId]);

  useEffect(() => {
    void load();
  }, [load]);

  const {
    sort: columnSort,
    dir: sortDir,
    setSort,
  } = useUrlColumnSort<SessionsSortFact>({
    isColumn: isSessionsSortFact,
    defaultDir: defaultDirForSessionsGridSort,
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (scanFilter && !r.scanTypes.includes(scanFilter) && r.lastScanType !== scanFilter) {
        return false;
      }
      if (q && !r.staffName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [query, rows, scanFilter, statusFilter]);

  const sorted = useMemo(() => {
    if (!columnSort || !sortDir) {
      return [...filtered].sort((a, b) => a.staffName.localeCompare(b.staffName) || a.staffId - b.staffId);
    }
    const type = SESSIONS_SORT_FACT_TYPES[columnSort];
    const value = (r: SessionDayRow) => {
      switch (columnSort) {
        case 'staff':
          return r.staffName;
        case 'status':
          return r.status;
        case 'station':
          return r.lastScanType;
        case 'duration':
          return r.activeMs;
        case 'blocks':
          return r.sessionCount;
        default:
          return null;
      }
    };
    return [...filtered].sort((a, b) => {
      const primary = compareGridValues(value(a), value(b), { type, dir: sortDir });
      return primary !== 0 ? primary : a.staffName.localeCompare(b.staffName) || a.staffId - b.staffId;
    });
  }, [columnSort, filtered, sortDir]);

  const groups = useMemo(
    () => singleBand(sorted, (r) => String(r.staffId)) as [string, RowGroup<SessionDayRow>[]][],
    [sorted],
  );

  const selected = rows.find((r) => r.staffId === selectedStaffId) ?? null;

  const dateMenu = useMemo(
    () => ({
      range: {
        from: dateKeyToLocalDate(dateKey),
        to: dateKeyToLocalDate(dateKey),
      } as DateRange,
      onRangeChange: (next: DateRange | undefined) => {
        const nextKey = next?.from ? localDateToDateKey(next.from) : todayKey;
        writeParams((p) => {
          if (!nextKey || nextKey === todayKey) p.delete('date');
          else p.set('date', nextKey);
        });
      },
    }),
    [dateKey, todayKey, writeParams],
  );

  const filterOptions = useMemo((): DataTableFilterOption[] => {
    const statusOpts: DataTableFilterOption[] = STATUS_IDS.map((id) => ({
      id: `status:${id}`,
      group: 'Status',
      label: SESSION_DAY_STATUS_LABEL[id],
      active: statusFilter === id,
    }));
    const scanOpts: DataTableFilterOption[] = SCAN_SESSION_TYPES.map((id) => ({
      id: `scan:${id}`,
      group: 'Station',
      label: sessionStationLabel(null, id) ?? id,
      active: scanFilter === id,
    }));
    return [...statusOpts, ...scanOpts];
  }, [scanFilter, statusFilter]);

  const paintRow = (row: SessionDayRow, visible: readonly SessionsGridColumn[]) => (
    <CompoundRow
      key={row.staffId}
      data-session-staff-id={row.staffId}
      role="button"
      tabIndex={0}
      aria-pressed={selectedStaffId === row.staffId}
      aria-label={`${row.staffName} sessions`}
      className="group/row cursor-pointer"
      onClick={() =>
        writeParams((p) => {
          if (selectedStaffId === row.staffId) p.delete('staff');
          else p.set('staff', String(row.staffId));
        })
      }
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          writeParams((p) => {
            if (selectedStaffId === row.staffId) p.delete('staff');
            else p.set('staff', String(row.staffId));
          });
        }
      }}
      columns={visible}
      capabilities={SESSIONS_GRID_CAPABILITIES}
      selected={selectedStaffId === row.staffId}
      view={{
        slots: sessionsSlotValuesFor(row, visible),
        ...sessionDayCompoundView(row),
      }}
      onOpen={() =>
        writeParams((p) => {
          p.set('staff', String(row.staffId));
        })
      }
    />
  );

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-surface-card">
      <DataTable<SessionDayRow, SessionsGridColumnKey, SessionsGridColumn>
        binding={SESSIONS_TABLE_BINDING}
        columns={columns}
        fields={fields}
        orderGroupsByDate={groups}
        rows={sorted}
        getRowId={(r) => String(r.staffId)}
        sort={sessionsColumnKeyForSort(columns, columnSort)}
        dir={sortDir}
        onSortChange={(key, nextDir) => {
          const fact = sessionsSortFactFor(
            columns.find((c) => c.key === key) ?? { key, sortable: true },
          );
          if (fact) setSort(fact, nextDir);
        }}
        loading={loading}
        search={{
          value: query,
          onChange: (next) =>
            writeParams((p) => {
              if (!next) p.delete('q');
              else p.set('q', next);
            }),
          placeholder: 'Filter staff…',
        }}
        filter={{
          options: filterOptions,
          onToggle: (id) => {
            writeParams((p) => {
              if (id.startsWith('status:')) {
                const next = id.slice('status:'.length);
                if (statusFilter === next) p.delete('status');
                else p.set('status', next);
              } else if (id.startsWith('scan:')) {
                const next = id.slice('scan:'.length);
                if (scanFilter === next) p.delete('scan');
                else p.set('scan', next);
              }
            });
          },
          onClearAll: () =>
            writeParams((p) => {
              p.delete('status');
              p.delete('scan');
            }),
        }}
        dateMenu={dateMenu}
        views={{
          storageKey: SHEET_SAVED_VIEW_KEY.reports_sessions,
          paramKeys: [
            'tab',
            'date',
            'staff',
            'q',
            'status',
            'scan',
            'colsort',
            'coldir',
          ],
          emptyHint: 'Save this day’s staff filter as a view on this table.',
        }}
        emptyMessage={
          error
            ? error
            : query.trim() !== ''
              ? 'No staffer matches that search.'
              : 'No floor time on this day.'
        }
        renderGroup={(group, _stripe, { columns: visible }) => (
          <>{group.rows.map((row) => paintRow(row, visible))}</>
        )}
        renderRow={(row, _stripe, { columns: visible }) => paintRow(row, visible)}
      />
      <SessionDayInspector
        row={selected}
        intervals={selected ? intervals : []}
        onClose={() => writeParams((p) => p.delete('staff'))}
      />
    </div>
  );
}
