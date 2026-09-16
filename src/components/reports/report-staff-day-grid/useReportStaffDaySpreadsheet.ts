'use client';

/**
 * **Staff-day spreadsheet** — the family glue that resolves a
 * {@link DataTable} feed bag. Spread it onto the host; there is no second
 * table component.
 *
 * ```tsx
 * const sheet = useReportStaffDaySpreadsheet({ rows, loading });
 * return <DataTable {...sheet} totalCount={rows.length} />;
 * ```
 *
 * Sort and search are LOCAL state, like the sibling reports: this desk owns no
 * report search params beyond `?tab=` and `?date=`, and a `?sort=` round-trip
 * would make a header click re-render the whole desk for an ordering the
 * client already holds.
 */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import { resolveReportStaffDaySlotValue } from '@/lib/tables/field-catalog/report-staff-day-resolve';
import type { StaffDayReportRow } from '@/lib/reports/staff-day-rows';
import { reportStaffDayCompoundView } from './report-staff-day-row-view';
import {
  reportStaffDayCompoundColumnsFor,
  reportStaffDaySortFactFor,
  type ReportStaffDayGridColumn,
  type ReportStaffDayGridColumnKey,
} from './report-staff-day-grid-layout';
import {
  REPORT_STAFF_DAY_GRID_CAPABILITIES,
  REPORT_STAFF_DAY_TABLE_BINDING,
} from './report-staff-day-table-definition';
import { useReportStaffDayTableLayout } from './useReportStaffDayTableLayout';

export interface UseReportStaffDaySpreadsheetOptions {
  /** One day's (staffer × task) rows, roster order; a header click re-orders. */
  rows: readonly StaffDayReportRow[];
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
}

export function useReportStaffDaySpreadsheet({
  rows,
  loading = false,
  emptyMessage = 'No checks on this day — nobody was on the roster, or the list was empty.',
  searchPlaceholder = 'Filter this day…',
}: UseReportStaffDaySpreadsheetOptions): CompoundSpreadsheetFeed<
  StaffDayReportRow,
  ReportStaffDayGridColumnKey,
  ReportStaffDayGridColumn
> {
  const [sort, setSort] = useState<ReportStaffDayGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);
  const [query, setQuery] = useState('');

  const { effectiveLayout, subtitleFieldIds, fields } = useReportStaffDayTableLayout();
  const columns = useMemo(
    () => reportStaffDayCompoundColumnsFor(effectiveLayout),
    [effectiveLayout],
  );

  const onSortChange = useCallback(
    (key: ReportStaffDayGridColumnKey, nextDir: 'asc' | 'desc') => {
      setSort(key);
      setDir(nextDir);
    },
    [],
  );

  const search = useMemo(
    () => ({ value: query, onChange: setQuery, placeholder: searchPlaceholder }),
    [query, searchPlaceholder],
  );

  return useCompoundSpreadsheet<
    StaffDayReportRow,
    ReportStaffDayGridColumnKey,
    ReportStaffDayGridColumn
  >({
    binding: REPORT_STAFF_DAY_TABLE_BINDING,
    columns,
    fields,
    rows,
    getRowId: (row) => `${row.staffId}-${row.itemId}`,
    adapter: reportStaffDayCompoundView,
    subtitleFieldIds,
    resolve: resolveReportStaffDaySlotValue,
    sortFactFor: reportStaffDaySortFactFor,
    capabilities: REPORT_STAFF_DAY_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange,
    search,
    loading,
    emptyMessage,
    ariaLabel: 'Staff day, one row per staffer and task',
  });
}
