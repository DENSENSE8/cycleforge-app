'use client';

/**
 * **Team spreadsheet** — the family glue that resolves a
 * {@link DataTable} feed bag. Spread it onto the host; there is no second table
 * component.
 *
 * This is the whole of the port's display code, and it is a `.ts` file: the
 * engine paints the rows, so the family contributes a catalog, a resolver, an
 * adapter and a column array — and nothing else.
 *
 * Sort and search are local state: they narrow what is already on screen, and
 * writing them to the URL would round-trip the server for a client-side reorder.
 */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import type { CompoundRowAction } from '@/components/tables/compound/compound-row-model';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import { resolveStaffDirectorySlotValue } from '@/lib/tables/field-catalog/staff-directory-resolve';
import { staffDirectoryCompoundView } from '@/lib/staff/staff-directory-row-adapter';
import type { StaffDirectoryRow } from '@/lib/staff/staff-directory-row';
import { STAFFDIRECTORY_GRID_CAPABILITIES } from './staff-directory-grid-descriptor';
import {
  staffDirectoryCompoundColumnsFor,
  staffDirectorySortFactFor,
  type StaffDirectoryGridColumn,
  type StaffDirectoryGridColumnKey,
} from './staff-directory-grid-layout';
import { STAFFDIRECTORY_TABLE_BINDING } from './staff-directory-table-definition';
import { useStaffDirectoryTableLayout } from './useStaffDirectoryTableLayout';

export interface UseStaffDirectorySpreadsheetOptions {
  rows: readonly StaffDirectoryRow[];
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
  /** The family's row verbs, resolved per row. See `useCompoundSpreadsheet`. */
  rowActions?: (row: StaffDirectoryRow) => readonly CompoundRowAction[];
}

export function useStaffDirectorySpreadsheet({
  rows,
  loading = false,
  emptyMessage = 'No teammates yet.',
  searchPlaceholder = 'Filter team…',
  rowActions,
}: UseStaffDirectorySpreadsheetOptions): CompoundSpreadsheetFeed<
  StaffDirectoryRow,
  StaffDirectoryGridColumnKey,
  StaffDirectoryGridColumn
> {
  const [sort, setSort] = useState<StaffDirectoryGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);
  const [query, setQuery] = useState('');

  const { effectiveLayout, subtitleFieldIds, fields } = useStaffDirectoryTableLayout();
  const columns = useMemo(() => staffDirectoryCompoundColumnsFor(effectiveLayout), [effectiveLayout]);

  const onSortChange = useCallback((key: StaffDirectoryGridColumnKey, nextDir: 'asc' | 'desc') => {
    setSort(key);
    setDir(nextDir);
  }, []);

  const search = useMemo(
    () => ({ value: query, onChange: setQuery, placeholder: searchPlaceholder }),
    [query, searchPlaceholder],
  );

  return useCompoundSpreadsheet<StaffDirectoryRow, StaffDirectoryGridColumnKey, StaffDirectoryGridColumn>({
    binding: STAFFDIRECTORY_TABLE_BINDING,
    columns,
    fields,
    rows,
    getRowId: (row) => String(row.id),
    adapter: staffDirectoryCompoundView,
    subtitleFieldIds,
    resolve: resolveStaffDirectorySlotValue,
    sortFactFor: staffDirectorySortFactFor,
    capabilities: STAFFDIRECTORY_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange,
    search,
    loading,
    emptyMessage,
    ariaLabel: 'Team',
    rowActions,
  });
}
