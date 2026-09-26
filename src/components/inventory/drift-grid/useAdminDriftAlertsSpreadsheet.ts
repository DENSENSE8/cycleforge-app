'use client';

/** **Open-drift-alerts spreadsheet** — the family glue that resolves a {@link DataTable} feed bag. */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import { resolveAdminDriftAlertsSlotValue } from '@/lib/tables/field-catalog/admin-drift-alerts-resolve';
import type { DriftAlertRow } from '@/lib/inventory/drift-rows';
import { adminDriftAlertsCompoundView } from './admin-drift-alerts-row-view';
import {
  adminDriftAlertsCompoundColumnsFor,
  adminDriftAlertsSortFactFor,
  type AdminDriftAlertsGridColumn,
  type AdminDriftAlertsGridColumnKey,
} from './admin-drift-alerts-grid-layout';
import {
  ADMIN_DRIFT_ALERTS_GRID_CAPABILITIES,
  ADMIN_DRIFT_ALERTS_TABLE_BINDING,
} from './admin-drift-alerts-table-definition';
import { useAdminDriftAlertsTableLayout } from './useAdminDriftAlertsTableLayout';

export interface UseAdminDriftAlertsSpreadsheetOptions {
  /** The feed — newest first off the server. A header click re-orders it. */
  rows: readonly DriftAlertRow[];
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
  /** The binding's `navigate` record plane, wired by the mount to the router. */
  onOpenRow?: (row: DriftAlertRow) => void;
}

export function useAdminDriftAlertsSpreadsheet({
  rows,
  loading = false,
  emptyMessage = 'No open DRIFT alerts. The drift-check cron resolves an alert the run after its SKU reconciles.',
  searchPlaceholder = 'Filter alerts…',
  onOpenRow,
}: UseAdminDriftAlertsSpreadsheetOptions): CompoundSpreadsheetFeed<
  DriftAlertRow,
  AdminDriftAlertsGridColumnKey,
  AdminDriftAlertsGridColumn
> {
  const [sort, setSort] = useState<AdminDriftAlertsGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);
  const [query, setQuery] = useState('');

  const { effectiveLayout, subtitleFieldIds, fields } = useAdminDriftAlertsTableLayout();
  const columns = useMemo(
    () => adminDriftAlertsCompoundColumnsFor(effectiveLayout),
    [effectiveLayout],
  );

  const onSortChange = useCallback(
    (key: AdminDriftAlertsGridColumnKey, nextDir: 'asc' | 'desc') => {
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
    DriftAlertRow,
    AdminDriftAlertsGridColumnKey,
    AdminDriftAlertsGridColumn
  >({
    binding: ADMIN_DRIFT_ALERTS_TABLE_BINDING,
    columns,
    fields,
    rows,
    getRowId: (row) => String(row.id),
    adapter: adminDriftAlertsCompoundView,
    subtitleFieldIds,
    resolve: resolveAdminDriftAlertsSlotValue,
    sortFactFor: adminDriftAlertsSortFactFor,
    capabilities: ADMIN_DRIFT_ALERTS_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange,
    search,
    loading,
    emptyMessage,
    ariaLabel: 'Open drift alerts',
    onOpenRow,
  });
}
