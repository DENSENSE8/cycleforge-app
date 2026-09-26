'use client';

/** **Bulk-allocate spreadsheet** — the family glue that resolves a {@link DataTable} feed bag. */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import type { CompoundRowAction } from '@/components/tables/compound/compound-row-model';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import { resolveAdminBulkAllocateSlotValue } from '@/lib/tables/field-catalog/admin-bulk-allocate-resolve';
import type { AllocationCandidateRow } from '@/lib/inventory/allocation-candidate-row';
import { adminBulkAllocateCompoundView } from './admin-bulk-allocate-row-view';
import {
  adminBulkAllocateCompoundColumnsFor,
  adminBulkAllocateSortFactFor,
  type AdminBulkAllocateGridColumn,
  type AdminBulkAllocateGridColumnKey,
} from './admin-bulk-allocate-grid-layout';
import {
  ADMIN_BULK_ALLOCATE_GRID_CAPABILITIES,
  ADMIN_BULK_ALLOCATE_TABLE_BINDING,
} from './admin-bulk-allocate-table-definition';
import { useAdminBulkAllocateTableLayout } from './useAdminBulkAllocateTableLayout';

export interface UseAdminBulkAllocateSpreadsheetOptions {
  /** One offset page of candidates. Already ordered by the server. */
  rows: readonly AllocationCandidateRow[];
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
  /** The binding's `navigate` record plane, wired by the mount to the router. */
  onOpenRow?: (row: AllocationCandidateRow) => void;
  /** The family's row verbs, resolved per row. See `useCompoundSpreadsheet`. */
  rowActions?: (row: AllocationCandidateRow) => readonly CompoundRowAction[];
}

export function useAdminBulkAllocateSpreadsheet({
  rows,
  loading = false,
  emptyMessage = 'Every non-shipped order with a SKU already has an open allocation. Nothing to do.',
  searchPlaceholder = 'Filter this page…',
  onOpenRow,
  rowActions,
}: UseAdminBulkAllocateSpreadsheetOptions): CompoundSpreadsheetFeed<
  AllocationCandidateRow,
  AdminBulkAllocateGridColumnKey,
  AdminBulkAllocateGridColumn
> {
  const [sort, setSort] = useState<AdminBulkAllocateGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);
  const [query, setQuery] = useState('');

  const { effectiveLayout, subtitleFieldIds, fields } = useAdminBulkAllocateTableLayout();
  const columns = useMemo(
    () => adminBulkAllocateCompoundColumnsFor(effectiveLayout),
    [effectiveLayout],
  );

  const onSortChange = useCallback(
    (key: AdminBulkAllocateGridColumnKey, nextDir: 'asc' | 'desc') => {
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
    AllocationCandidateRow,
    AdminBulkAllocateGridColumnKey,
    AdminBulkAllocateGridColumn
  >({
    binding: ADMIN_BULK_ALLOCATE_TABLE_BINDING,
    columns,
    fields,
    rows,
    getRowId: (row) => String(row.order_id),
    adapter: adminBulkAllocateCompoundView,
    subtitleFieldIds,
    resolve: resolveAdminBulkAllocateSlotValue,
    sortFactFor: adminBulkAllocateSortFactFor,
    capabilities: ADMIN_BULK_ALLOCATE_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange,
    search,
    loading,
    emptyMessage,
    ariaLabel: 'Allocation candidates',
    onOpenRow,
    rowActions,
  });
}
