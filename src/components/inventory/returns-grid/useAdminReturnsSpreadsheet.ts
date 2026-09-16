'use client';

/**
 * **Returns dock spreadsheet** — the family glue that resolves a
 * {@link DataTable} feed bag. Spread it onto the host; there is no second table
 * component.
 *
 * ```tsx
 * const sheet = useAdminReturnsSpreadsheet({ rows });
 * return <DataTable {...sheet} totalCount={rows.length} />;
 * ```
 *
 * This is the whole of the port's display code, and it is a `.ts` file: the
 * engine paints the rows, so the family contributes a catalog, a resolver, an
 * adapter and a column array — and nothing else.
 *
 * ## Why sort and search are local state here
 *
 * The dock is a PANE under an intake form, not a queue lane that owns a route:
 * the page's search params are the form's own flash channel (`?ok=1`,
 * `?error=…`, `?missing=…`), and writing `?sort=` beside them would make a
 * header click replay the intake redirect's banner. Durability in the URL is
 * the rule for a lane that IS a page; it is not a rule for a pane.
 */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import { resolveAdminReturnsSlotValue } from '@/lib/tables/field-catalog/admin-returns-resolve';
import type { RecentReturnRow } from '@/lib/inventory/returns-row';
import { adminReturnsCompoundView } from './admin-returns-row-view';
import {
  adminReturnsCompoundColumnsFor,
  adminReturnsSortFactFor,
  type AdminReturnsGridColumn,
  type AdminReturnsGridColumnKey,
} from './admin-returns-grid-layout';
import {
  ADMIN_RETURNS_GRID_CAPABILITIES,
  ADMIN_RETURNS_TABLE_BINDING,
} from './admin-returns-table-definition';
import { useAdminReturnsTableLayout } from './useAdminReturnsTableLayout';

export interface UseAdminReturnsSpreadsheetOptions {
  /** The feed. Already ordered by the server; a header click re-orders it. */
  rows: readonly RecentReturnRow[];
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
  /** The binding's `navigate` record plane, wired by the mount to the router. */
  onOpenRow?: (row: RecentReturnRow) => void;
}

export function useAdminReturnsSpreadsheet({
  rows,
  loading = false,
  emptyMessage = 'No returns recorded yet.',
  searchPlaceholder = 'Filter returns…',
  onOpenRow,
}: UseAdminReturnsSpreadsheetOptions): CompoundSpreadsheetFeed<
  RecentReturnRow,
  AdminReturnsGridColumnKey,
  AdminReturnsGridColumn
> {
  const [sort, setSort] = useState<AdminReturnsGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);
  const [query, setQuery] = useState('');

  const { effectiveLayout, subtitleFieldIds, fields } = useAdminReturnsTableLayout();
  const columns = useMemo(
    () => adminReturnsCompoundColumnsFor(effectiveLayout),
    [effectiveLayout],
  );

  const onSortChange = useCallback(
    (key: AdminReturnsGridColumnKey, nextDir: 'asc' | 'desc') => {
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
    RecentReturnRow,
    AdminReturnsGridColumnKey,
    AdminReturnsGridColumn
  >({
    binding: ADMIN_RETURNS_TABLE_BINDING,
    columns,
    fields,
    rows,
    getRowId: (row) => String(row.id),
    adapter: adminReturnsCompoundView,
    subtitleFieldIds,
    resolve: resolveAdminReturnsSlotValue,
    sortFactFor: adminReturnsSortFactFor,
    capabilities: ADMIN_RETURNS_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange,
    search,
    loading,
    emptyMessage,
    ariaLabel: 'Recent returns',
    onOpenRow,
  });
}
