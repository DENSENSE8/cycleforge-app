'use client';

/**
 * **SKU-exceptions spreadsheet** — the family glue that resolves the effective
 * slot layout, materializes the compound columns, owns the URL column sort
 * (`?colsort=` / `?coldir=`) and hands `DataTable` its feed.
 *
 * ```tsx
 * const sheet = useSkuExceptionsSpreadsheet({ rows, search, onOpenRow });
 * return <DataTable {...sheet} />;
 * ```
 *
 * The feed is small (one row per open placeholder), so search is answered
 * CLIENT-side by the engine over every painted fact — including the barcode
 * and the description the adapter paints outside a track.
 */

import { useMemo } from 'react';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import type { DataTableSearch } from '@/components/tables/DataTable';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import type { ProvisionalSku } from '@/lib/neon/provisional-sku-queries';
import { resolveSkuExceptionsSlotValue } from '@/lib/tables/field-catalog/sku-exceptions-resolve';
import {
  defaultDirForSlotTableColumn,
  isSlotTableColumnSortable,
  slotTableColumnsFor,
  slotTableSortFactFor,
  type SlotTableColumn,
  type SlotTableColumnKey,
} from '@/components/tables/compound/slot-table-columns';
import { useSlotTableLayout } from '@/components/tables/useSlotTableLayout';
import { SKU_EXCEPTIONS_FAMILY } from '@/lib/tables/field-catalog/sku-exceptions';
import { skuExceptionsCompoundView } from './sku-exceptions-row-view';
import {
  SKU_EXCEPTIONS_GRID_CAPABILITIES,
  SKU_EXCEPTIONS_TABLE_BINDING,
} from './sku-exceptions-table-definition';

export interface UseSkuExceptionsSpreadsheetOptions {
  rows: readonly ProvisionalSku[];
  /** Caller-owned so the page keeps it in `?q=`. */
  search: DataTableSearch;
  loading: boolean;
  /** The record plane — writes `?sku=`. */
  onOpenRow: (row: ProvisionalSku) => void;
  emptyMessage: string;
}

export function useSkuExceptionsSpreadsheet({
  rows,
  search,
  loading,
  onOpenRow,
  emptyMessage,
}: UseSkuExceptionsSpreadsheetOptions): CompoundSpreadsheetFeed<
  ProvisionalSku,
  SlotTableColumnKey,
  SlotTableColumn
> {
  const { effectiveLayout, subtitleFieldIds, fields } = useSlotTableLayout(SKU_EXCEPTIONS_FAMILY);
  const columns = useMemo(
    () => slotTableColumnsFor(SKU_EXCEPTIONS_FAMILY, effectiveLayout),
    [effectiveLayout],
  );

  const { sort, dir, setSort } = useUrlColumnSort<SlotTableColumnKey>({
    isColumn: (raw) => isSlotTableColumnSortable(SKU_EXCEPTIONS_FAMILY, columns, raw),
    defaultDir: (key) => defaultDirForSlotTableColumn(SKU_EXCEPTIONS_FAMILY, columns, key),
  });

  return useCompoundSpreadsheet<ProvisionalSku, SlotTableColumnKey, SlotTableColumn>({
    binding: SKU_EXCEPTIONS_TABLE_BINDING,
    columns,
    fields,
    rows,
    getRowId: (row) => row.sku,
    adapter: skuExceptionsCompoundView,
    subtitleFieldIds,
    lineQtyMeaning: 'on-hand',
    // Painted by the adapter outside any track: the barcode on the Id track's
    // second line, the description as the note under the title.
    adapterPaintedFieldIds: ['sku-exceptions.barcode', 'sku-exceptions.description'],
    resolve: resolveSkuExceptionsSlotValue,
    sortFactFor: (col) => slotTableSortFactFor(SKU_EXCEPTIONS_FAMILY, col),
    capabilities: SKU_EXCEPTIONS_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange: setSort,
    search,
    loading,
    emptyMessage,
    onOpenRow,
    ariaLabel: 'SKU exceptions',
  });
}
