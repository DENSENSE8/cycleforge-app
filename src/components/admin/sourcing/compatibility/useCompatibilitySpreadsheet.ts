'use client';

/**
 * **Compatibility rules spreadsheet** — the family glue that resolves a
 * {@link DataTable} feed bag. Spread it onto the host; there is no second table
 * component.
 *
 * This is the whole of the port's display code, and it is a `.ts` file: the
 * engine paints the rows, so the family contributes a catalog, a resolver, an
 * adapter and a column array — and nothing else.
 *
 * Sort and search are local state: they narrow what is already on screen, and
 * writing them to the URL would round-trip the server for a client-side reorder.
 */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import type { CompoundRowAction } from '@/components/tables/compound/compound-row-model';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import { resolveCompatibilitySlotValue } from '@/lib/tables/field-catalog/compatibility-resolve';
import { compatibilityCompoundView } from '@/lib/sourcing/compatibility-edge-row-adapter';
import type { CompatibilityEdgeRow } from '@/lib/sourcing/compatibility-edge-row';
import { COMPATIBILITY_GRID_CAPABILITIES } from './compatibility-grid-descriptor';
import {
  compatibilityCompoundColumnsFor,
  compatibilitySortFactFor,
  type CompatibilityGridColumn,
  type CompatibilityGridColumnKey,
} from './compatibility-grid-layout';
import { COMPATIBILITY_TABLE_BINDING } from './compatibility-table-definition';
import { useCompatibilityTableLayout } from './useCompatibilityTableLayout';

export interface UseCompatibilitySpreadsheetOptions {
  rows: readonly CompatibilityEdgeRow[];
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
  /** The family's row verbs, resolved per row. See `useCompoundSpreadsheet`. */
  rowActions?: (row: CompatibilityEdgeRow) => readonly CompoundRowAction[];
}

export function useCompatibilitySpreadsheet({
  rows,
  loading = false,
  emptyMessage = 'No compatibility rules yet.',
  searchPlaceholder = 'Filter rules…',
  rowActions,
}: UseCompatibilitySpreadsheetOptions): CompoundSpreadsheetFeed<
  CompatibilityEdgeRow,
  CompatibilityGridColumnKey,
  CompatibilityGridColumn
> {
  const [sort, setSort] = useState<CompatibilityGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);
  const [query, setQuery] = useState('');

  const { effectiveLayout, fields } = useCompatibilityTableLayout();
  const columns = useMemo(() => compatibilityCompoundColumnsFor(effectiveLayout), [effectiveLayout]);

  const onSortChange = useCallback((key: CompatibilityGridColumnKey, nextDir: 'asc' | 'desc') => {
    setSort(key);
    setDir(nextDir);
  }, []);

  const search = useMemo(
    () => ({ value: query, onChange: setQuery, placeholder: searchPlaceholder }),
    [query, searchPlaceholder],
  );

  return useCompoundSpreadsheet<CompatibilityEdgeRow, CompatibilityGridColumnKey, CompatibilityGridColumn>({
    binding: COMPATIBILITY_TABLE_BINDING,
    columns,
    fields,
    rows,
    getRowId: (row) => String(row.id),
    adapter: compatibilityCompoundView,
    resolve: resolveCompatibilitySlotValue,
    sortFactFor: compatibilitySortFactFor,
    capabilities: COMPATIBILITY_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange,
    search,
    loading,
    emptyMessage,
    ariaLabel: 'Compatibility rules',
    rowActions,
  });
}
