'use client';

/** **Holds desk spreadsheet** — the family glue that resolves a {@link DataTable} feed bag. */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import type { CompoundRowAction } from '@/components/tables/compound/compound-row-model';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import { resolveAdminHoldsSlotValue } from '@/lib/tables/field-catalog/admin-holds-resolve';
import type { HeldUnitRow } from '@/lib/inventory/held-unit-row';
import { adminHoldsCompoundView } from './admin-holds-row-view';
import {
  adminHoldsCompoundColumnsFor,
  adminHoldsSortFactFor,
  type AdminHoldsGridColumn,
  type AdminHoldsGridColumnKey,
} from './admin-holds-grid-layout';
import {
  ADMINHOLDS_GRID_CAPABILITIES,
  ADMINHOLDS_TABLE_BINDING,
} from './admin-holds-table-definition';
import { useAdminHoldsTableLayout } from './useAdminHoldsTableLayout';

interface UseAdminHoldsSpreadsheetOptions {
  /** The feed. Already ordered by the server; a header click re-orders it. */
  rows: readonly HeldUnitRow[];
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
  /** The binding's `navigate` record plane, wired by the mount to the router. */
  onOpenRow?: (row: HeldUnitRow) => void;
  /** The family's row verbs (`admin-holds-verbs.ts`), resolved per row. */
  rowActions?: (row: HeldUnitRow) => readonly CompoundRowAction[];
}

export function useAdminHoldsSpreadsheet({
  rows,
  loading = false,
  emptyMessage = 'No units currently on hold.',
  searchPlaceholder = 'Filter held units…',
  onOpenRow,
  rowActions,
}: UseAdminHoldsSpreadsheetOptions): CompoundSpreadsheetFeed<
  HeldUnitRow,
  AdminHoldsGridColumnKey,
  AdminHoldsGridColumn
> {
  const [sort, setSort] = useState<AdminHoldsGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);
  const [query, setQuery] = useState('');

  const { effectiveLayout, subtitleFieldIds, fields } = useAdminHoldsTableLayout();
  const columns = useMemo(
    () => adminHoldsCompoundColumnsFor(effectiveLayout),
    [effectiveLayout],
  );

  const onSortChange = useCallback(
    (key: AdminHoldsGridColumnKey, nextDir: 'asc' | 'desc') => {
      setSort(key);
      setDir(nextDir);
    },
    [],
  );

  const search = useMemo(
    () => ({ value: query, onChange: setQuery, placeholder: searchPlaceholder }),
    [query, searchPlaceholder],
  );

  return useCompoundSpreadsheet<HeldUnitRow, AdminHoldsGridColumnKey, AdminHoldsGridColumn>({
    binding: ADMINHOLDS_TABLE_BINDING,
    columns,
    fields,
    rows,
    getRowId: (row) => String(row.id),
    adapter: adminHoldsCompoundView,
    subtitleFieldIds,
    resolve: resolveAdminHoldsSlotValue,
    sortFactFor: adminHoldsSortFactFor,
    capabilities: ADMINHOLDS_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange,
    search,
    loading,
    emptyMessage,
    ariaLabel: 'Units on hold',
    onOpenRow,
    rowActions,
  });
}
