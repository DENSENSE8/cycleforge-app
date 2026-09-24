'use client';

/**
 * **Completed-tasks spreadsheet** — the family glue that resolves a
 * {@link DataTable} feed bag. Spread it onto the host; there is no second
 * table component.
 *
 * ```tsx
 * const sheet = useReportTasksSpreadsheet({ rows, loading });
 * return <DataTable {...sheet} totalCount={rows.length} />;
 * ```
 *
 * This is the whole of the tab's display code, and it is a `.ts` file: the
 * engine paints the rows, so the family contributes a catalog, a resolver, an
 * adapter and a family RECORD — and nothing else. `/reports` mounts one such
 * hook per tab and never a component that swaps column sets.
 *
 * ## Why sort is local state and the FIND TEXT is not
 *
 * `/reports` owns two search params (`?tab=`, `?date=`) and nothing else. A
 * header click writing `?sort=` would round-trip a URL nothing else reads, so
 * the header sorts the page in hand.
 *
 * The find text is different in kind, because the page in hand is a WINDOW:
 * `GET /api/tasks?limit=` returns the desk's most recent finished work, not
 * every finished task. A substring pass here could therefore only ever find
 * tasks that already arrived, and it re-narrowed even those to the facts the
 * MOUNTED columns paint — a task found by its note or its ticket subject
 * vanished when neither column was on. So the text lives with the fetch
 * (`?q=`), and the engine is told the rows are already the answer.
 */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import {
  slotTableColumnsFor,
  slotTableSortFactFor,
  type SlotTableColumn,
  type SlotTableColumnKey,
} from '@/components/tables/compound/slot-table-columns';
import { useSlotTableLayout } from '@/components/tables/useSlotTableLayout';
import { REPORT_TASKS_FAMILY } from '@/lib/tables/field-catalog/report-tasks';
import { resolveReportTasksSlotValue } from '@/lib/tables/field-catalog/report-tasks-resolve';
import type { TaskDeskRow } from '@/lib/tasks/task-desk-row';
import { reportTasksCompoundView } from './report-tasks-row-view';
import {
  REPORT_TASKS_GRID_CAPABILITIES,
  REPORT_TASKS_TABLE_BINDING,
} from './report-tasks-table-definition';

export interface UseReportTasksSpreadsheetOptions {
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
  SlotTableColumnKey,
  SlotTableColumn
> {
  const [sort, setSort] = useState<SlotTableColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);

  const { effectiveLayout, subtitleFieldIds, fields } = useSlotTableLayout(REPORT_TASKS_FAMILY);
  const columns = useMemo(
    () => slotTableColumnsFor(REPORT_TASKS_FAMILY, effectiveLayout),
    [effectiveLayout],
  );

  const onSortChange = useCallback((key: SlotTableColumnKey, nextDir: 'asc' | 'desc') => {
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

  return useCompoundSpreadsheet<TaskDeskRow, SlotTableColumnKey, SlotTableColumn>({
    binding: REPORT_TASKS_TABLE_BINDING,
    columns,
    fields,
    rows,
    getRowId: (row) => String(row.id),
    adapter: reportTasksCompoundView,
    subtitleFieldIds,
    resolve: resolveReportTasksSlotValue,
    sortFactFor: (col) => slotTableSortFactFor(REPORT_TASKS_FAMILY, col),
    capabilities: REPORT_TASKS_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange,
    search,
    loading,
    emptyMessage,
    ariaLabel: 'Completed tasks',
  });
}
