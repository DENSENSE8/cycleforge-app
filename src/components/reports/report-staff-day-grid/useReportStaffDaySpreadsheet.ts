'use client';

/** **Staff-day spreadsheet** — the family glue that resolves a {@link DataTable} feed bag. */

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
  reportStaffDaySortFactFor,
  type ReportStaffDayGridColumn,
  type ReportStaffDayGridColumnKey,
} from './report-staff-day-grid-layout';
import {
  REPORT_STAFF_DAY_GRID_CAPABILITIES,
  REPORT_STAFF_DAY_TABLE_BINDING,
} from './report-staff-day-table-definition';

interface UseReportStaffDaySpreadsheetOptions {
  /** One day's (staffer × task) rows, roster order; a header click re-orders. */
  rows: readonly StaffDayReportRow[];
  loading?: boolean;
  emptyMessage?: string;
  searchValue: string;
  onSearchChange: (next: string) => void;
}

export function useReportStaffDaySpreadsheet({
  rows,
  loading = false,
  emptyMessage = 'No checks on this day — nobody was on the roster, or the list was empty.',
  searchValue,
  onSearchChange,
}: UseReportStaffDaySpreadsheetOptions): CompoundSpreadsheetFeed<
  StaffDayReportRow,
  ReportStaffDayGridColumnKey,
  ReportStaffDayGridColumn
> {
  const [sort, setSort] = useState<ReportStaffDayGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);




  const onSortChange = useCallback(
    (key: ReportStaffDayGridColumnKey, nextDir: 'asc' | 'desc') => {
      setSort(key);
      setDir(nextDir);
    },
    [],
  );

  const search = useMemo(
    () => ({ value: searchValue, onChange: onSearchChange, placeholder: 'Filter this day…' }),
    [searchValue, onSearchChange],
  );

  return useCompoundSpreadsheet<
    StaffDayReportRow,
    ReportStaffDayGridColumnKey,
    ReportStaffDayGridColumn
  >({
    binding: REPORT_STAFF_DAY_TABLE_BINDING,
    columns: REPORT_STAFF_DAY_TABLE_BINDING.columns,
    rows,
    getRowId: (row) => `${row.staffId}-${row.itemId}`,
    adapter: reportStaffDayCompoundView,
    resolve: resolveReportStaffDaySlotValue,
    sortFactFor: reportStaffDaySortFactFor,
    capabilities: REPORT_STAFF_DAY_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange,
    search,
    findOwner: 'page',
    loading,
    emptyMessage,
    ariaLabel: 'Staff day, one row per staffer and task',
  });
}
