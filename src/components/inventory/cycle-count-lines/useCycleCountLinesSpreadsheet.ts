'use client';

/** **Cycle-count-lines spreadsheet** — the family glue that resolves a {@link DataTable} feed bag. */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import type { CompoundRowAction } from '@/components/tables/compound/compound-row-model';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import type { CycleCountLineRow } from '@/lib/inventory/cycle-count-line-row';
import { resolveCycleCountLinesSlotValue } from '@/lib/tables/field-catalog/cycle-count-lines-resolve';
import { cycleCountLinesCompoundView } from './cycle-count-lines-row-view';
import {
  cycleCountLinesSortFactFor,
  type CycleCountLinesGridColumn,
  type CycleCountLinesGridColumnKey,
} from './cycle-count-lines-grid-layout';
import {
  CYCLECOUNTLINES_GRID_CAPABILITIES,
  CYCLECOUNTLINES_TABLE_BINDING,
} from './cycle-count-lines-table-definition';

interface UseCycleCountLinesSpreadsheetOptions {
  rows: readonly CycleCountLineRow[];
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
  /** The family's row verbs, resolved per row. See `useCompoundSpreadsheet`. */
  rowActions?: (row: CycleCountLineRow) => readonly CompoundRowAction[];
}

export function useCycleCountLinesSpreadsheet({
  rows,
  loading = false,
  emptyMessage = 'No lines in this campaign yet.',
  searchPlaceholder = 'Filter lines…',
  rowActions,
}: UseCycleCountLinesSpreadsheetOptions): CompoundSpreadsheetFeed<
  CycleCountLineRow,
  CycleCountLinesGridColumnKey,
  CycleCountLinesGridColumn
> {
  const [sort, setSort] = useState<CycleCountLinesGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);
  const [query, setQuery] = useState('');




  const onSortChange = useCallback(
    (key: CycleCountLinesGridColumnKey, nextDir: 'asc' | 'desc') => {
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
    CycleCountLineRow,
    CycleCountLinesGridColumnKey,
    CycleCountLinesGridColumn
  >({
    binding: CYCLECOUNTLINES_TABLE_BINDING,
    columns: CYCLECOUNTLINES_TABLE_BINDING.columns,
    rows,
    getRowId: (row) => String(row.id),
    adapter: cycleCountLinesCompoundView,
    resolve: resolveCycleCountLinesSlotValue,
    sortFactFor: cycleCountLinesSortFactFor,
    capabilities: CYCLECOUNTLINES_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange,
    search,
    loading,
    emptyMessage,
    ariaLabel: 'Cycle count lines',
    rowActions,
  });
}
