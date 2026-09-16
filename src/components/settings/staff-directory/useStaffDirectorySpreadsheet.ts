'use client';

/**
 * **Staff-directory spreadsheet** — the family glue that resolves a
 * {@link DataTable} feed bag. Spread it onto the host; there is no second
 * table component.
 *
 * ```tsx
 * const sheet = useStaffDirectorySpreadsheet({ rows, rowActions, onOpenRow });
 * return <DataTable {...sheet} totalCount={rows.length} />;
 * ```
 *
 * This is the whole of the port's display code, and it is a `.ts` file: the
 * engine paints the rows, so the family contributes a catalog, a resolver, an
 * adapter and a column array — and nothing else.
 *
 * ## Why sort and search are local state here
 *
 * `/settings/staff` has no search params of its own: the retired desk kept a
 * `filter` string in `useState` and narrowed the array it already held in
 * memory. Writing `?q=` per keystroke would round-trip a server component to
 * reorder a roster the client is holding. The search box the engine renders
 * IS that filter, over every MOUNTED fact rather than the three the retired
 * `.filter()` hard-coded (name / role / status).
 */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import type { CompoundRowAction } from '@/components/tables/compound/compound-row-model';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import { resolveStaffDirectorySlotValue } from '@/lib/tables/field-catalog/staff-directory-resolve';
import type { StaffDirectoryRow } from '@/lib/staff/staff-directory-row';
import { staffDirectoryCompoundView } from './staff-directory-row-view';
import {
  staffDirectoryCompoundColumnsFor,
  staffDirectorySortFactFor,
  type StaffDirectoryGridColumn,
  type StaffDirectoryGridColumnKey,
} from './staff-directory-grid-layout';
import {
  STAFF_DIRECTORY_GRID_CAPABILITIES,
  STAFF_DIRECTORY_TABLE_BINDING,
} from './staff-directory-table-definition';
import { useStaffDirectoryTableLayout } from './useStaffDirectoryTableLayout';

export interface UseStaffDirectorySpreadsheetOptions {
  rows: readonly StaffDirectoryRow[];
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
  /** The family's row verbs, resolved per row. See `useCompoundSpreadsheet`. */
  rowActions?: (row: StaffDirectoryRow) => readonly CompoundRowAction[];
  /** The `navigate` record plane — Settings › Access for this teammate. */
  onOpenRow?: (row: StaffDirectoryRow) => void;
}

export function useStaffDirectorySpreadsheet({
  rows,
  loading = false,
  emptyMessage = 'No teammates yet.',
  searchPlaceholder = 'Filter by name, role, or status…',
  rowActions,
  onOpenRow,
}: UseStaffDirectorySpreadsheetOptions): CompoundSpreadsheetFeed<
  StaffDirectoryRow,
  StaffDirectoryGridColumnKey,
  StaffDirectoryGridColumn
> {
  const [sort, setSort] = useState<StaffDirectoryGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);
  const [query, setQuery] = useState('');

  const { effectiveLayout, subtitleFieldIds, fields } = useStaffDirectoryTableLayout();
  const columns = useMemo(
    () => staffDirectoryCompoundColumnsFor(effectiveLayout),
    [effectiveLayout],
  );

  const onSortChange = useCallback(
    (key: StaffDirectoryGridColumnKey, nextDir: 'asc' | 'desc') => {
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
    StaffDirectoryRow,
    StaffDirectoryGridColumnKey,
    StaffDirectoryGridColumn
  >({
    binding: STAFF_DIRECTORY_TABLE_BINDING,
    columns,
    fields,
    rows,
    getRowId: (row) => String(row.id),
    adapter: staffDirectoryCompoundView,
    subtitleFieldIds,
    resolve: resolveStaffDirectorySlotValue,
    sortFactFor: staffDirectorySortFactFor,
    capabilities: STAFF_DIRECTORY_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange,
    search,
    loading,
    emptyMessage,
    ariaLabel: 'Team',
    rowActions,
    onOpenRow,
  });
}
