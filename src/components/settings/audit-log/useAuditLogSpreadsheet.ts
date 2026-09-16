'use client';

/**
 * **Audit-log spreadsheet** — the family glue that resolves a {@link DataTable}
 * feed bag. Spread it onto the host; there is no second table component.
 *
 * ```tsx
 * const sheet = useAuditLogSpreadsheet({ rows });
 * return <DataTable {...sheet} totalCount={rows.length} />;
 * ```
 *
 * This is the whole of the port's display code, and it is a `.ts` file: the
 * engine paints the rows, so the family contributes a catalog, a resolver, an
 * adapter and a column array — and nothing else.
 *
 * ## Why sort and search are local state here
 *
 * `/settings/audit` owns its search params, but they are the SERVER query's:
 * `?source=`/`?action=` narrow the SQL and `?cursor=` walks keyset pages of
 * fifty. Writing `?sort=` beside them would make a header click round-trip the
 * server — and re-run the keyset page — to reorder fifty rows the client
 * already holds. The page's own filter form stays the durable narrowing; the
 * header sorts the page in hand.
 */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
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
  /** One keyset page. Already ordered by the server; a header click re-orders it. */
  rows: readonly AuditLogRow[];
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
}

export function useAuditLogSpreadsheet({
  rows,
  loading = false,
  emptyMessage = 'No audit entries yet.',
  searchPlaceholder = 'Filter this page…',
}: UseAuditLogSpreadsheetOptions): CompoundSpreadsheetFeed<
  AuditLogRow,
  AuditLogGridColumnKey,
  AuditLogGridColumn
> {
  const [sort, setSort] = useState<AuditLogGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);
  const [query, setQuery] = useState('');

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

  const search = useMemo(
    () => ({ value: query, onChange: setQuery, placeholder: searchPlaceholder }),
    [query, searchPlaceholder],
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
