'use client';

/** **Completed-tasks spreadsheet** — the family glue that resolves a {@link DataTable} feed bag. */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import {
  type DataTableCompoundColumn,
  type DataTableCompoundColumnKey,
} from '@/components/tables/compound/data-table-compound-columns';
import { resolveReportTasksSlotValue } from '@/lib/tables/field-catalog/report-tasks-resolve';
import type { TaskDeskRow } from '@/lib/tasks/task-desk-row';
import { reportTasksCompoundView } from './report-tasks-row-view';
import {
  REPORT_TASKS_GRID_CAPABILITIES,
  REPORT_TASKS_TABLE_BINDING,
} from './report-tasks-table-definition';

function reportTasksSortFact(col: { key: string; fieldId?: string; sortable?: boolean }): string | null {
  if (col.sortable === false) return null;
  if (col.key === 'fulfillment') return 'report-tasks.id';
  if (col.key === 'item') return 'report-tasks.note';
  if (col.key === 'dates') return 'report-tasks.completed';
  if (col.key === 'state') return 'report-tasks.status';
  return col.fieldId ?? null;
}

interface UseReportTasksSpreadsheetOptions {
  /** One page of finished tasks, already in desk order; a header click re-orders it. */
  rows: readonly TaskDeskRow[];
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
  /** The find text, owned by the page because it rides the report's fetch. */
  searchValue: string;
  onSearchChange: (next: string) => void;
  /** A request for the CURRENT text is in flight — holds the loading face. */
  searchPending?: boolean;
}

export function useReportTasksSpreadsheet({
  rows,
  loading = false,
  // Names the SCOPE, not just the absence: this tab reads every staffer's
  // finished work, so a short (or empty) list must not read as a filter the
  // operator forgot they set.
  emptyMessage = 'No finished tasks for any staffer in this window.',
  searchPlaceholder = 'Filter this report…',
  searchValue,
  onSearchChange,
  searchPending = false,
}: UseReportTasksSpreadsheetOptions): CompoundSpreadsheetFeed<
  TaskDeskRow,
  DataTableCompoundColumnKey,
  DataTableCompoundColumn
> {
  const [sort, setSort] = useState<DataTableCompoundColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);


  const onSortChange = useCallback((key: DataTableCompoundColumnKey, nextDir: 'asc' | 'desc') => {
    setSort(key);
    setDir(nextDir);
  }, []);

  const search = useMemo(
    () => ({
      value: searchValue,
      onChange: onSearchChange,
      placeholder: searchPlaceholder,
      answeredBy: 'server' as const,
      pending: searchPending,
    }),
    [searchValue, onSearchChange, searchPlaceholder, searchPending],
  );

  return useCompoundSpreadsheet<TaskDeskRow, DataTableCompoundColumnKey, DataTableCompoundColumn>({
    binding: REPORT_TASKS_TABLE_BINDING,
    columns: REPORT_TASKS_TABLE_BINDING.columns,
    rows,
    getRowId: (row) => String(row.id),
    adapter: reportTasksCompoundView,
    resolve: resolveReportTasksSlotValue,
    sortFactFor: reportTasksSortFact,
    capabilities: REPORT_TASKS_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange,
    search,
    findOwner: 'page',
    loading,
    emptyMessage,
    ariaLabel: 'Completed tasks',
  });
}
