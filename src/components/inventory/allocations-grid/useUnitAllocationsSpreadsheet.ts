'use client';

/** **Unit-allocations spreadsheet** — the family glue that resolves a {@link DataTable} feed bag. */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import { resolveUnitAllocationsSlotValue } from '@/lib/tables/field-catalog/unit-allocations-resolve';
import type { UnitAllocationTableRow } from '@/lib/inventory/unit-allocation-row';
import { unitAllocationsCompoundView } from './unit-allocations-row-view';
import {
  unitAllocationsCompoundColumnsFor,
  unitAllocationsSortFactFor,
  type UnitAllocationsGridColumn,
  type UnitAllocationsGridColumnKey,
} from './unit-allocations-grid-layout';
import {
  UNIT_ALLOCATIONS_GRID_CAPABILITIES,
  UNIT_ALLOCATIONS_TABLE_BINDING,
} from './unit-allocations-table-definition';
import { useUnitAllocationsTableLayout } from './useUnitAllocationsTableLayout';

interface UseUnitAllocationsSpreadsheetOptions {
  /** The feed. Already ordered by the API; a header click re-orders it. */
  rows: readonly UnitAllocationTableRow[];
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
}

export function useUnitAllocationsSpreadsheet({
  rows,
  loading = false,
  /**
   * The empty state the retired hand table did not have: it was wrapped in
   * `allocations.length > 0 ?` and the whole section vanished, so "never
   * allocated" and "this panel does not exist" read identically.
   */
  emptyMessage = 'No order has ever been allocated this unit.',
  searchPlaceholder = 'Filter allocations…',
}: UseUnitAllocationsSpreadsheetOptions): CompoundSpreadsheetFeed<
  UnitAllocationTableRow,
  UnitAllocationsGridColumnKey,
  UnitAllocationsGridColumn
> {
  const [sort, setSort] = useState<UnitAllocationsGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);
  const [query, setQuery] = useState('');

  const { effectiveLayout, subtitleFieldIds, fields } = useUnitAllocationsTableLayout();
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
    binding: UNIT_ALLOCATIONS_TABLE_BINDING,
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
    ariaLabel: 'Order allocations',
  });
}
