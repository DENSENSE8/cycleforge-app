'use client';

/**
 * **Audit-log spreadsheet** — the family glue that resolves a {@link DataTable}
 * feed bag. Spread it onto the host; there is no second table component.
 *
 * ```tsx
 * const sheet = useAuditLogSpreadsheet({ rows, search });
 * return <DataTable {...sheet} totalCount={rows.length} />;
 * ```
 *
 * This is the whole of the port's display code, and it is a `.ts` file: the
 * engine paints the rows, so the family contributes a catalog, a resolver, an
 * adapter and a column array — and nothing else.
 *
 * ## Why sort is local state and search is not
 *
 * `/settings/audit` owns its search params, and they are the SERVER query's:
 * `?source=`/`?action=` narrow the SQL, `?q=` is the find box's fetch key, and
 * `?cursor=` walks keyset pages of fifty. Writing `?sort=` beside them would
 * make a header click round-trip the server — and re-run the keyset page — to
 * reorder fifty rows the client already holds, so the header sorts the page in
 * hand.
 *
 * SEARCH is the opposite case and is therefore the caller's: the box asks a
 * question about 25k rows, only fifty of which are here. The mount passes the
 * whole {@link DataTableSearch} — including `answeredBy: 'server'` — and this
 * hook holds no query state of its own; a local `useState` here would be a
 * second, narrower answer painted over the server's.
 */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import type { DataTableSearch } from '@/components/tables/DataTable';
import { resolveAuditLogSlotValue } from '@/lib/tables/field-catalog/audit-log-resolve';
import type { AuditLogRow } from '@/lib/audit/audit-log-row';
import { auditLogCompoundView } from './audit-log-row-view';
import {
  auditLogCompoundColumnsFor,
  auditLogSortFactFor,
  type AuditLogGridColumn,
  type AuditLogGridColumnKey,
} from './audit-log-grid-layout';
import {
  AUDITLOG_GRID_CAPABILITIES,
  AUDITLOG_TABLE_BINDING,
} from './audit-log-table-definition';
import { useAuditLogTableLayout } from './useAuditLogTableLayout';

export interface UseAuditLogSpreadsheetOptions {
  /**
   * One keyset page — ALREADY the answer for `search.value`, because the page
   * spends that param in SQL. A header click re-orders what is here.
   */
  rows: readonly AuditLogRow[];
  /**
   * Caller-owned so the page can keep it in the URL. Never a constant.
   *
   * The full {@link DataTableSearch}, not a three-field subset: a windowed
   * caller has to be able to say `answeredBy: 'server'` through this seam, and
   * a narrower type here would silently drop the flag that stops the engine
   * re-filtering a set it cannot see all of.
   */
  search: DataTableSearch;
  loading?: boolean;
  emptyMessage?: string;
}

export function useAuditLogSpreadsheet({
  rows,
  search,
  loading = false,
  emptyMessage = 'No audit entries yet.',
}: UseAuditLogSpreadsheetOptions): CompoundSpreadsheetFeed<
  AuditLogRow,
  AuditLogGridColumnKey,
  AuditLogGridColumn
> {
  const [sort, setSort] = useState<AuditLogGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);

  const { effectiveLayout, subtitleFieldIds, fields } = useAuditLogTableLayout();
  const columns = useMemo(
    () => auditLogCompoundColumnsFor(effectiveLayout),
    [effectiveLayout],
  );

  const onSortChange = useCallback(
    (key: AuditLogGridColumnKey, nextDir: 'asc' | 'desc') => {
      setSort(key);
      setDir(nextDir);
    },
    [],
  );

  return useCompoundSpreadsheet<AuditLogRow, AuditLogGridColumnKey, AuditLogGridColumn>({
    binding: AUDITLOG_TABLE_BINDING,
    columns,
    fields,
    rows,
    getRowId: (row) => String(row.id),
    adapter: auditLogCompoundView,
    subtitleFieldIds,
    resolve: resolveAuditLogSlotValue,
    sortFactFor: auditLogSortFactFor,
    capabilities: AUDITLOG_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange,
    search,
    loading,
    emptyMessage,
    ariaLabel: 'Audit log',
  });
}
