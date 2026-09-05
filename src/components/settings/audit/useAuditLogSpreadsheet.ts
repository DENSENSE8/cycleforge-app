'use client';

/**
 * **Audit log spreadsheet** — the family glue that resolves a {@link DataTable}
 * feed bag for `/settings/audit`. Spread it onto the host; there is no second
 * table component.
 *
 * This is the whole of the port's display code, and it is a `.ts` file: the
 * engine paints the rows ({@link useCompoundSpreadsheet} → `CompoundPlaneRow` →
 * `CompoundRow` → `CompoundCells`), so the family contributes a catalog, a
 * resolver, an adapter and a column array — and nothing else. It replaced five
 * `AdminTableColumn` objects carrying JSX.
 *
 * ## What the log GAINED by leaving the second engine
 *
 * Click-to-sort on every painted data header, a search box over the mounted
 * facts, the Fields picker, per-org slot bindings, and the same row chrome as
 * every other desk. `AdminTable` had none of them and was never going to grow
 * them for one page.
 *
 * ## Why sort and search are local state here
 *
 * The page's own filters (`?source=`, `?action=`, `?cursor=`) stay in the URL
 * and stay on the server — they narrow the QUERY. Sort and search here narrow
 * what is already on screen, and writing them to the same URL would round-trip
 * the database for a client-side reorder.
 */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import { resolveAuditLogSlotValue } from '@/lib/tables/field-catalog/audit-log-resolve';
import { auditLogCompoundView } from '@/lib/audit-log/audit-log-row-adapter';
import type { AuditLogRow } from '@/lib/audit-log/audit-log-row';
import { AUDIT_LOG_GRID_CAPABILITIES } from './audit-log-grid-descriptor';
import {
  auditLogCompoundColumnsFor,
  auditLogSortFactFor,
  type AuditLogGridColumn,
  type AuditLogGridColumnKey,
} from './audit-log-grid-layout';
import { AUDIT_LOG_TABLE_BINDING } from './audit-log-table-definition';
import { useAuditLogTableLayout } from './useAuditLogTableLayout';

export interface UseAuditLogSpreadsheetOptions {
  /** The feed — already ordered newest-first by the query. */
  rows: readonly AuditLogRow[];
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
}

export function useAuditLogSpreadsheet({
  rows,
  loading = false,
  emptyMessage = 'No audit entries yet.',
  searchPlaceholder = 'Filter these entries…',
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
    binding: AUDIT_LOG_TABLE_BINDING,
    columns,
    fields,
    rows,
    getRowId: (row) => String(row.id),
    adapter: auditLogCompoundView,
    subtitleFieldIds,
    resolve: resolveAuditLogSlotValue,
    sortFactFor: auditLogSortFactFor,
    capabilities: AUDIT_LOG_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange,
    search,
    loading,
    emptyMessage,
    ariaLabel: 'Audit log',
  });
}
