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
  /**
   * The find text, OWNED BY THE MOUNT because it rides that mount's fetch key.
   *
   * It is not local state here on purpose. `/api/walk-in/sales` answers `?q=`
   * across the whole merged feed — Square mirror and counter visits, by
   * customer, phone, email, handle, status and line items — while this table
   * paints five of those facts. A second in-memory substring pass over the
   * painted facts would therefore DELETE rows the server had already found: a
   * sale matched by its phone number would arrive and then vanish. So the value
   * lives with the fetch and the engine is told the answer is already correct
   * (`answeredBy: 'server'`).
   */
  searchValue: string;
  onSearchChange: (next: string) => void;
  /** A request for the CURRENT text is in flight — holds the loading face. */
  searchPending?: boolean;
}

export function useWalkInSalesSpreadsheet({
  rows,
  loading = false,
  emptyMessage = 'No walk-in sales yet.',
  searchPlaceholder = 'Search sales…',
  searchValue,
  onSearchChange,
  searchPending = false,
}: UseWalkInSalesSpreadsheetOptions): CompoundSpreadsheetFeed<
  SaleRow,
  WalkInSalesGridColumnKey,
  WalkInSalesGridColumn
> {
  const [sort, setSort] = useState<WalkInSalesGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);

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
    () => ({
      value: searchValue,
      onChange: onSearchChange,
      placeholder: searchPlaceholder,
      answeredBy: 'server' as const,
      pending: searchPending,
    }),
    [searchValue, onSearchChange, searchPlaceholder, searchPending],
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
