'use client';

/** **Audit-log spreadsheet** — the family glue that resolves a {@link DataTable} feed bag. */

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

interface UseAuditLogSpreadsheetOptions {
  /**
   * One keyset page — ALREADY the answer for `search.value`, because the page
   * spends that param in SQL. A header click re-orders what is here.
   */
  rows: readonly AuditLogRow[];
  /** Caller-owned so the page can keep it in the URL. */
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
