'use client';

/** **Per-SKU allocations spreadsheet** — this mount's glue onto the shared {@link useCompoundSpreadsheet}. */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import { resolveUnitAllocationsSlotValue } from '@/lib/tables/field-catalog/unit-allocations-resolve';
import type { UnitAllocationTableRow } from '@/lib/inventory/unit-allocation-row';
import { unitAllocationsCompoundView } from '@/components/inventory/allocations-grid/unit-allocations-row-view';
import {
  unitAllocationsCompoundColumnsFor,
  unitAllocationsSortFactFor,
  type UnitAllocationsGridColumn,
  type UnitAllocationsGridColumnKey,
} from '@/components/inventory/allocations-grid/unit-allocations-grid-layout';
import { UNIT_ALLOCATIONS_GRID_CAPABILITIES } from '@/components/inventory/allocations-grid/unit-allocations-table-definition';
import { SKU_ALLOCATIONS_TABLE_BINDING } from './sku-allocations-table-definition';
import { useSkuAllocationsTableLayout } from './useSkuAllocationsTableLayout';

interface UseSkuAllocationsSpreadsheetOptions {
  /** The open holds on this SKU's units. Already ordered; a header click re-orders it. */
  rows: readonly UnitAllocationTableRow[];
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
  /** The binding's `navigate` record plane, wired to the router by the mount. */
  onOpenRow?: (row: UnitAllocationTableRow) => void;
}

export function useSkuAllocationsSpreadsheet({
  rows,
  loading = false,
  /**
   * The empty state the retired table did not have: it was wrapped in
   * `allocations.length > 0 ?` and the whole section vanished, so "nothing is
   * holding this stock" and "this panel does not exist" read identically.
   */
  emptyMessage = 'No open allocations — nothing is holding this SKU.',
  searchPlaceholder = 'Filter allocations…',
  onOpenRow,
}: UseSkuAllocationsSpreadsheetOptions): CompoundSpreadsheetFeed<
  UnitAllocationTableRow,
  UnitAllocationsGridColumnKey,
  UnitAllocationsGridColumn
> {
  const [sort, setSort] = useState<UnitAllocationsGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);
  const [query, setQuery] = useState('');

  const { effectiveLayout, subtitleFieldIds, fields } = useSkuAllocationsTableLayout();
  const columns = useMemo(
    () => unitAllocationsCompoundColumnsFor(effectiveLayout),
    [effectiveLayout],
  );

  const onSortChange = useCallback(
    (key: UnitAllocationsGridColumnKey, nextDir: 'asc' | 'desc') => {
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
    UnitAllocationTableRow,
    UnitAllocationsGridColumnKey,
    UnitAllocationsGridColumn
  >({
    binding: SKU_ALLOCATIONS_TABLE_BINDING,
    columns,
    fields,
    rows,
    getRowId: (row) => String(row.id),
    adapter: unitAllocationsCompoundView,
    subtitleFieldIds,
    resolve: resolveUnitAllocationsSlotValue,
    sortFactFor: unitAllocationsSortFactFor,
    capabilities: UNIT_ALLOCATIONS_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange,
    search,
    loading,
    emptyMessage,
    ariaLabel: 'Open allocations',
    onOpenRow,
  });
}
