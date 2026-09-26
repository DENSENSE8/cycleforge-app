'use client';

/** **Part-compatibility spreadsheet** — the family glue that resolves a {@link DataTable} feed bag. */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import type { CompoundRowAction } from '@/components/tables/compound/compound-row-model';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import { resolvePartCompatibilitySlotValue } from '@/lib/tables/field-catalog/part-compatibility-resolve';
import type { PartCompatibilityEdgeRow } from '@/lib/sourcing/part-compatibility-row';
import { partCompatibilityCompoundView } from './part-compatibility-row-view';
import {
  partCompatibilityCompoundColumnsFor,
  partCompatibilitySortFactFor,
  type PartCompatibilityGridColumn,
  type PartCompatibilityGridColumnKey,
} from './part-compatibility-grid-layout';
import {
  PART_COMPATIBILITY_GRID_CAPABILITIES,
  PART_COMPATIBILITY_TABLE_BINDING,
} from './part-compatibility-table-definition';
import { usePartCompatibilityTableLayout } from './usePartCompatibilityTableLayout';

interface UsePartCompatibilitySpreadsheetOptions {
  rows: readonly PartCompatibilityEdgeRow[];
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
  /** The family's row verbs, resolved per row. See `useCompoundSpreadsheet`. */
  rowActions?: (row: PartCompatibilityEdgeRow) => readonly CompoundRowAction[];
}

export function usePartCompatibilitySpreadsheet({
  rows,
  loading = false,
  emptyMessage = 'No compatibility edges.',
  searchPlaceholder = 'Filter edges…',
  rowActions,
}: UsePartCompatibilitySpreadsheetOptions): CompoundSpreadsheetFeed<
  PartCompatibilityEdgeRow,
  PartCompatibilityGridColumnKey,
  PartCompatibilityGridColumn
> {
  const [sort, setSort] = useState<PartCompatibilityGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);
  const [query, setQuery] = useState('');

  const { effectiveLayout, subtitleFieldIds, fields } = usePartCompatibilityTableLayout();
  const columns = useMemo(
    () => partCompatibilityCompoundColumnsFor(effectiveLayout),
    [effectiveLayout],
  );

  const onSortChange = useCallback(
    (key: PartCompatibilityGridColumnKey, nextDir: 'asc' | 'desc') => {
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
    PartCompatibilityEdgeRow,
    PartCompatibilityGridColumnKey,
    PartCompatibilityGridColumn
  >({
    binding: PART_COMPATIBILITY_TABLE_BINDING,
    columns,
    fields,
    rows,
    getRowId: (row) => String(row.id),
    adapter: partCompatibilityCompoundView,
    subtitleFieldIds,
    resolve: resolvePartCompatibilitySlotValue,
    sortFactFor: partCompatibilitySortFactFor,
    capabilities: PART_COMPATIBILITY_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange,
    search,
    loading,
    emptyMessage,
    ariaLabel: 'Compatibility edges',
    rowActions,
  });
}
