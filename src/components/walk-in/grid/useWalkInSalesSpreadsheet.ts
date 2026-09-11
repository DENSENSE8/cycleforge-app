'use client';

/**
 * Walk-in sales spreadsheet — family glue that resolves a DataTable feed bag.
 *
 * Callers: SalesHistoryTable.
 * Affected API: none (rows already fetched).
 * Data schemas: SaleRow.
 * User: completed visit appears as history on the Sales board slot table.
 */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import { resolveWalkInSalesSlotValue } from '@/lib/tables/field-catalog/walk-in-sales-resolve';
import { walkInSaleCompoundView } from '@/lib/walk-in/walk-in-sales-row-adapter';
import type { SaleRow } from '@/lib/walk-in/transactions';
import { WALKINSALES_GRID_CAPABILITIES } from './walk-in-sales-grid-descriptor';
import {
  walkInSalesCompoundColumnsFor,
  walkInSalesSortFactFor,
  type WalkInSalesGridColumn,
  type WalkInSalesGridColumnKey,
} from './walk-in-sales-grid-layout';
import { WALKINSALES_TABLE_BINDING } from './walk-in-sales-table-definition';
import { useWalkInSalesTableLayout } from './useWalkInSalesTableLayout';

export interface UseWalkInSalesSpreadsheetOptions {
  rows: readonly SaleRow[];
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
}

export function useWalkInSalesSpreadsheet({
  rows,
  loading = false,
  emptyMessage = 'No walk-in sales yet.',
  searchPlaceholder = 'Search sales…',
}: UseWalkInSalesSpreadsheetOptions): CompoundSpreadsheetFeed<
  SaleRow,
  WalkInSalesGridColumnKey,
  WalkInSalesGridColumn
> {
  const [sort, setSort] = useState<WalkInSalesGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);
  const [query, setQuery] = useState('');

  const { effectiveLayout, subtitleFieldIds, fields } = useWalkInSalesTableLayout();
  const columns = useMemo(
    () => walkInSalesCompoundColumnsFor(effectiveLayout),
    [effectiveLayout],
  );

  const onSortChange = useCallback((key: WalkInSalesGridColumnKey, nextDir: 'asc' | 'desc') => {
    setSort(key);
    setDir(nextDir);
  }, []);

  const search = useMemo(
    () => ({ value: query, onChange: setQuery, placeholder: searchPlaceholder }),
    [query, searchPlaceholder],
  );

  return useCompoundSpreadsheet<SaleRow, WalkInSalesGridColumnKey, WalkInSalesGridColumn>({
    binding: WALKINSALES_TABLE_BINDING,
    columns,
    fields,
    rows,
    getRowId: (row) => row.id,
    adapter: walkInSaleCompoundView,
    subtitleFieldIds,
    resolve: resolveWalkInSalesSlotValue,
    sortFactFor: walkInSalesSortFactFor,
    capabilities: WALKINSALES_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange,
    search,
    loading,
    emptyMessage,
    ariaLabel: 'Walk-in sales',
  });
}
