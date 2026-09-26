'use client';

/** **Stock-ledger spreadsheet** — the family glue that resolves a {@link DataTable} feed bag. */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import { resolveSkuLedgerSlotValue } from '@/lib/tables/field-catalog/sku-ledger-resolve';
import type { SkuLedgerTableRow } from '@/lib/inventory/sku-ledger-row';
import { skuLedgerCompoundView } from './sku-ledger-row-view';
import {
  skuLedgerCompoundColumnsFor,
  skuLedgerSortFactFor,
  type SkuLedgerGridColumn,
  type SkuLedgerGridColumnKey,
} from './sku-ledger-grid-layout';
import {
  SKU_LEDGER_GRID_CAPABILITIES,
  SKU_LEDGER_TABLE_BINDING,
} from './sku-ledger-table-definition';
import { useSkuLedgerTableLayout } from './useSkuLedgerTableLayout';

export interface UseSkuLedgerSpreadsheetOptions {
  /** One server window (the last hundred movements), newest first. */
  rows: readonly SkuLedgerTableRow[];
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
}

export function useSkuLedgerSpreadsheet({
  rows,
  loading = false,
  emptyMessage = 'No ledger entries for this SKU yet.',
  searchPlaceholder = 'Filter this page…',
}: UseSkuLedgerSpreadsheetOptions): CompoundSpreadsheetFeed<
  SkuLedgerTableRow,
  SkuLedgerGridColumnKey,
  SkuLedgerGridColumn
> {
  const [sort, setSort] = useState<SkuLedgerGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);
  const [query, setQuery] = useState('');

  const { effectiveLayout, subtitleFieldIds, fields } = useSkuLedgerTableLayout();
  const columns = useMemo(() => skuLedgerCompoundColumnsFor(effectiveLayout), [effectiveLayout]);

  const onSortChange = useCallback((key: SkuLedgerGridColumnKey, nextDir: 'asc' | 'desc') => {
    setSort(key);
    setDir(nextDir);
  }, []);

  const search = useMemo(
    () => ({ value: query, onChange: setQuery, placeholder: searchPlaceholder }),
    [query, searchPlaceholder],
  );

  return useCompoundSpreadsheet<SkuLedgerTableRow, SkuLedgerGridColumnKey, SkuLedgerGridColumn>({
    binding: SKU_LEDGER_TABLE_BINDING,
    columns,
    fields,
    rows,
    getRowId: (row) => String(row.id),
    adapter: skuLedgerCompoundView,
    subtitleFieldIds,
    resolve: resolveSkuLedgerSlotValue,
    sortFactFor: skuLedgerSortFactFor,
    capabilities: SKU_LEDGER_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange,
    search,
    loading,
    emptyMessage,
    ariaLabel: 'Stock ledger',
  });
}
