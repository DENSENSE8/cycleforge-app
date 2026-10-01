'use client';

/** **Per-SKU bins spreadsheet** — the family glue that resolves a {@link DataTable} feed bag. */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import { resolveSkuBinsSlotValue } from '@/lib/tables/field-catalog/sku-bins-resolve';
import type { SkuBinTableRow } from '@/lib/inventory/sku-bin-row';
import { skuBinsCompoundView } from './sku-bins-row-view';
import {
  type DataTableCompoundColumn,
  type DataTableCompoundColumnKey,
} from '@/components/tables/compound/data-table-compound-columns';
import { SKU_BINS_GRID_CAPABILITIES, SKU_BINS_TABLE_BINDING } from './sku-bins-table-definition';

function skuBinsSortFact(col: { key: string; fieldId?: string; sortable?: boolean }): string | null {
  if (col.sortable === false) return null;
  if (col.key === 'fulfillment') return 'sku-bins.bin';
  if (col.key === 'item') return 'sku-bins.item';
  if (col.key === 'dates') return 'sku-bins.last_counted';
  if (col.key === 'state') return 'sku-bins.level';
  return col.fieldId ?? null;
}

interface UseSkuBinsSpreadsheetOptions {
  /** Every bin holding this SKU. Already ordered by qty; a header click re-orders it. */
  rows: readonly SkuBinTableRow[];
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
}

export function useSkuBinsSpreadsheet({
  rows,
  loading = false,
  emptyMessage = 'No bin assignments for this SKU.',
  searchPlaceholder = 'Filter bins…',
}: UseSkuBinsSpreadsheetOptions): CompoundSpreadsheetFeed<
  SkuBinTableRow,
  DataTableCompoundColumnKey,
  DataTableCompoundColumn
> {
  const [sort, setSort] = useState<DataTableCompoundColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);
  const [query, setQuery] = useState('');


  const onSortChange = useCallback((key: DataTableCompoundColumnKey, nextDir: 'asc' | 'desc') => {
    setSort(key);
    setDir(nextDir);
  }, []);

  const search = useMemo(
    () => ({ value: query, onChange: setQuery, placeholder: searchPlaceholder }),
    [query, searchPlaceholder],
  );

  return useCompoundSpreadsheet<SkuBinTableRow, DataTableCompoundColumnKey, DataTableCompoundColumn>({
    binding: SKU_BINS_TABLE_BINDING,
    columns: SKU_BINS_TABLE_BINDING.columns,
    rows,
    getRowId: (row) => String(row.location_id),
    adapter: skuBinsCompoundView,
    resolve: resolveSkuBinsSlotValue,
    sortFactFor: skuBinsSortFact,
    capabilities: SKU_BINS_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange,
    search,
    loading,
    emptyMessage,
    ariaLabel: 'Bin distribution',
  });
}
