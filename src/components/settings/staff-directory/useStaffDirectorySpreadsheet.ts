'use client';

/** **Staff-directory spreadsheet** — the family glue that resolves a {@link DataTable} feed bag. */

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

interface UseStaffDirectorySpreadsheetOptions {
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
