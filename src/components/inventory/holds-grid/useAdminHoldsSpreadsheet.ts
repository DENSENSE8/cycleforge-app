'use client';

/**
 * **Holds desk spreadsheet** — the family glue that resolves a {@link DataTable}
 * feed bag. Spread it onto the host; there is no second table component.
 *
 * ```tsx
 * const sheet = useAdminHoldsSpreadsheet({ rows, rowActions, onOpenRow });
 * return <DataTable {...sheet} totalCount={rows.length} />;
 * ```
 *
 * This is the whole of the port's display code, and it is a `.ts` file: the
 * engine paints the rows, so the family contributes a catalog, a resolver, an
 * adapter and a column array — and nothing else.
 *
 * ## Why sort and search are local state here
 *
 * `/inventory/holds` owns exactly one search param and it is the hold
 * form's flash channel (`?error=missing_input|not_found`). Writing `?sort=`
 * beside it would make a header click re-render the RSC — re-running
 * `loadHeldUnits`' lateral join — to reorder at most two hundred rows the
 * client already holds, and would replay that error banner while doing it.
 * Durability in the URL is the rule for a lane that IS a queue route; it is not
 * a rule for an admin ops page whose params belong to a form.
 */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import type { CompoundRowAction } from '@/components/tables/compound/compound-row-model';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import { resolveAdminHoldsSlotValue } from '@/lib/tables/field-catalog/admin-holds-resolve';
import type { HeldUnitRow } from '@/lib/inventory/held-unit-row';
import { adminHoldsCompoundView } from './admin-holds-row-view';
import {
  adminHoldsCompoundColumnsFor,
  adminHoldsSortFactFor,
  type AdminHoldsGridColumn,
  type AdminHoldsGridColumnKey,
} from './admin-holds-grid-layout';
import {
  ADMINHOLDS_GRID_CAPABILITIES,
  ADMINHOLDS_TABLE_BINDING,
} from './admin-holds-table-definition';
import { useAdminHoldsTableLayout } from './useAdminHoldsTableLayout';

export interface UseAdminHoldsSpreadsheetOptions {
  /** The feed. Already ordered by the server; a header click re-orders it. */
  rows: readonly HeldUnitRow[];
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
  /** The binding's `navigate` record plane, wired by the mount to the router. */
  onOpenRow?: (row: HeldUnitRow) => void;
  /** The family's row verbs (`admin-holds-verbs.ts`), resolved per row. */
  rowActions?: (row: HeldUnitRow) => readonly CompoundRowAction[];
}

export function useAdminHoldsSpreadsheet({
  rows,
  loading = false,
  emptyMessage = 'No units currently on hold.',
  searchPlaceholder = 'Filter held units…',
  onOpenRow,
  rowActions,
}: UseAdminHoldsSpreadsheetOptions): CompoundSpreadsheetFeed<
  HeldUnitRow,
  AdminHoldsGridColumnKey,
  AdminHoldsGridColumn
> {
  const [sort, setSort] = useState<AdminHoldsGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);
  const [query, setQuery] = useState('');

  const { effectiveLayout, subtitleFieldIds, fields } = useAdminHoldsTableLayout();
  const columns = useMemo(
    () => adminHoldsCompoundColumnsFor(effectiveLayout),
    [effectiveLayout],
  );

  const onSortChange = useCallback(
    (key: AdminHoldsGridColumnKey, nextDir: 'asc' | 'desc') => {
      setSort(key);
      setDir(nextDir);
    },
    [],
  );

  const search = useMemo(
    () => ({ value: query, onChange: setQuery, placeholder: searchPlaceholder }),
    [query, searchPlaceholder],
  );

  return useCompoundSpreadsheet<HeldUnitRow, AdminHoldsGridColumnKey, AdminHoldsGridColumn>({
    binding: ADMINHOLDS_TABLE_BINDING,
    columns,
    fields,
    rows,
    getRowId: (row) => String(row.id),
    adapter: adminHoldsCompoundView,
    subtitleFieldIds,
    resolve: resolveAdminHoldsSlotValue,
    sortFactFor: adminHoldsSortFactFor,
    capabilities: ADMINHOLDS_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange,
    search,
    loading,
    emptyMessage,
    ariaLabel: 'Units on hold',
    onOpenRow,
    rowActions,
  });
}
