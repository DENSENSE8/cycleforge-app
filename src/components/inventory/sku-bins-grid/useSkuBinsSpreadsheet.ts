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
  slotTableColumnsFor,
  slotTableSortFactFor,
  type SlotTableColumn,
  type SlotTableColumnKey,
} from '@/components/tables/compound/slot-table-columns';
import { useSlotTableLayout } from '@/components/tables/useSlotTableLayout';
import { SKU_BINS_FAMILY } from '@/lib/tables/field-catalog/sku-bins';
import { SKU_BINS_GRID_CAPABILITIES, SKU_BINS_TABLE_BINDING } from './sku-bins-table-definition';

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
  SlotTableColumnKey,
  SlotTableColumn
> {
  const [sort, setSort] = useState<SlotTableColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);
  const [query, setQuery] = useState('');

  const { effectiveLayout, subtitleFieldIds, fields } = useSlotTableLayout(SKU_BINS_FAMILY);
  const columns = useMemo(
    () => slotTableColumnsFor(SKU_BINS_FAMILY, effectiveLayout),
    [effectiveLayout],
  );

  const onSortChange = useCallback((key: SlotTableColumnKey, nextDir: 'asc' | 'desc') => {
    setSort(key);
    setDir(nextDir);
  }, []);

  const search = useMemo(
    () => ({ value: query, onChange: setQuery, placeholder: searchPlaceholder }),
    [query, searchPlaceholder],
  );

  return useCompoundSpreadsheet<SkuBinTableRow, SlotTableColumnKey, SlotTableColumn>({
    binding: SKU_BINS_TABLE_BINDING,
    columns,
    fields,
    rows,
    getRowId: (row) => String(row.location_id),
    adapter: skuBinsCompoundView,
    subtitleFieldIds,
    resolve: resolveSkuBinsSlotValue,
    sortFactFor: (col) => slotTableSortFactFor(SKU_BINS_FAMILY, col),
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
