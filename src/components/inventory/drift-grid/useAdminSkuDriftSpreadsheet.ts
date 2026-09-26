'use client';

/** **SKU stock-drift spreadsheet** — the family glue that resolves a {@link DataTable} feed bag. */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import { resolveAdminSkuDriftSlotValue } from '@/lib/tables/field-catalog/admin-sku-drift-resolve';
import type { SkuDriftRow } from '@/lib/inventory/drift-rows';
import { adminSkuDriftCompoundView } from './admin-sku-drift-row-view';
import {
  adminSkuDriftCompoundColumnsFor,
  adminSkuDriftSortFactFor,
  type AdminSkuDriftGridColumn,
  type AdminSkuDriftGridColumnKey,
} from './admin-sku-drift-grid-layout';
import {
  ADMIN_SKU_DRIFT_GRID_CAPABILITIES,
  ADMIN_SKU_DRIFT_TABLE_BINDING,
} from './admin-sku-drift-table-definition';
import { useAdminSkuDriftTableLayout } from './useAdminSkuDriftTableLayout';

/** The retired clean-drift paragraph, now the table's settled-empty answer. */
export const SKU_DRIFT_CLEAN_MESSAGE =
  'sku_stock.stock equals SUM(sku_stock_ledger.delta) for every SKU. The trigger is working.';

export interface UseAdminSkuDriftSpreadsheetOptions {
  /** The feed — worst total drift first off the server, capped at 25. */
  rows: readonly SkuDriftRow[];
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
  /** The binding's `navigate` record plane, wired by the mount to the router. */
  onOpenRow?: (row: SkuDriftRow) => void;
}

export function useAdminSkuDriftSpreadsheet({
  rows,
  loading = false,
  emptyMessage = SKU_DRIFT_CLEAN_MESSAGE,
  searchPlaceholder = 'Filter SKUs…',
  onOpenRow,
}: UseAdminSkuDriftSpreadsheetOptions): CompoundSpreadsheetFeed<
  SkuDriftRow,
  AdminSkuDriftGridColumnKey,
  AdminSkuDriftGridColumn
> {
  const [sort, setSort] = useState<AdminSkuDriftGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);
  const [query, setQuery] = useState('');

  const { effectiveLayout, subtitleFieldIds, fields } = useAdminSkuDriftTableLayout();
  const columns = useMemo(
    () => adminSkuDriftCompoundColumnsFor(effectiveLayout),
    [effectiveLayout],
  );

  const onSortChange = useCallback(
    (key: AdminSkuDriftGridColumnKey, nextDir: 'asc' | 'desc') => {
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
    SkuDriftRow,
    AdminSkuDriftGridColumnKey,
    AdminSkuDriftGridColumn
  >({
    binding: ADMIN_SKU_DRIFT_TABLE_BINDING,
    columns,
    fields,
    rows,
    getRowId: (row) => row.sku,
    adapter: adminSkuDriftCompoundView,
    subtitleFieldIds,
    resolve: resolveAdminSkuDriftSlotValue,
    sortFactFor: adminSkuDriftSortFactFor,
    capabilities: ADMIN_SKU_DRIFT_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange,
    search,
    loading,
    emptyMessage,
    ariaLabel: 'SKU stock drift',
    onOpenRow,
  });
}
