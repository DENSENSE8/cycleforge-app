'use client';

/**
 * **Auth-sessions spreadsheet** — the family glue that resolves a
 * {@link DataTable} feed bag. Spread it onto the host; there is no second
 * table component.
 *
 * This is the whole of the port's display code, and it is a `.ts` file: the
 * engine paints the rows, so the family contributes a catalog, a resolver, an
 * adapter and a column array — and nothing else.
 *
 * Sort and search are local state: they narrow what is already on screen, and
 * writing them to the URL would round-trip the server for a client-side
 * reorder of a list this desk already holds in memory.
 */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import type { CompoundRowAction } from '@/components/tables/compound/compound-row-model';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import { resolveAuthSessionsSlotValue } from '@/lib/tables/field-catalog/auth-sessions-resolve';
import type { AuthSessionTableRow } from '@/lib/auth/auth-session-row';
import { authSessionsCompoundView } from './auth-sessions-row-view';
import {
  authSessionsCompoundColumnsFor,
  authSessionsSortFactFor,
  type AuthSessionsGridColumn,
  type AuthSessionsGridColumnKey,
} from './auth-sessions-grid-layout';
import {
  AUTHSESSIONS_GRID_CAPABILITIES,
  AUTHSESSIONS_TABLE_BINDING,
} from './auth-sessions-table-definition';
import { useAuthSessionsTableLayout } from './useAuthSessionsTableLayout';

export interface UseAuthSessionsSpreadsheetOptions {
  rows: readonly AuthSessionTableRow[];
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
  /** The family's row verbs, resolved per row. See `useCompoundSpreadsheet`. */
  rowActions?: (row: AuthSessionTableRow) => readonly CompoundRowAction[];
}

export function useAuthSessionsSpreadsheet({
  rows,
  loading = false,
  emptyMessage = 'No active sessions.',
  searchPlaceholder = 'Filter sessions…',
  rowActions,
}: UseAuthSessionsSpreadsheetOptions): CompoundSpreadsheetFeed<
  AuthSessionTableRow,
  AuthSessionsGridColumnKey,
  AuthSessionsGridColumn
> {
  const [sort, setSort] = useState<AuthSessionsGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);
  const [query, setQuery] = useState('');

  const { effectiveLayout, subtitleFieldIds, fields } = useAuthSessionsTableLayout();
  const columns = useMemo(() => authSessionsCompoundColumnsFor(effectiveLayout), [effectiveLayout]);

  const onSortChange = useCallback((key: AuthSessionsGridColumnKey, nextDir: 'asc' | 'desc') => {
    setSort(key);
    setDir(nextDir);
  }, []);

  const search = useMemo(
    () => ({ value: query, onChange: setQuery, placeholder: searchPlaceholder }),
    [query, searchPlaceholder],
  );

  return useCompoundSpreadsheet<AuthSessionTableRow, AuthSessionsGridColumnKey, AuthSessionsGridColumn>({
    binding: AUTHSESSIONS_TABLE_BINDING,
    columns,
    fields,
    rows,
    getRowId: (row) => row.sid,
    adapter: authSessionsCompoundView,
    subtitleFieldIds,
    resolve: resolveAuthSessionsSlotValue,
    sortFactFor: authSessionsSortFactFor,
    capabilities: AUTHSESSIONS_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange,
    search,
    loading,
    emptyMessage,
    ariaLabel: 'Active sessions',
    rowActions,
  });
}
