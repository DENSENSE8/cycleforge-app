'use client';

/**
 * **SKU stock-drift spreadsheet** — the family glue that resolves a
 * {@link DataTable} feed bag. Spread it onto the host; there is no second table
 * component.
 *
 * ```tsx
 * const sheet = useAdminSkuDriftSpreadsheet({ rows, onOpenRow });
 * return <DataTable {...sheet} totalCount={rows.length} />;
 * ```
 *
 * This is the whole of the port's display code, and it is a `.ts` file: the
 * engine paints the rows, so the family contributes a catalog, a resolver, an
 * adapter and a column array — and nothing else.
 *
 * ## The clean-drift prose IS the empty state
 *
 * The retired section had an empty BRANCH, not an empty state: when
 * `v_sku_stock_drift` was empty it swapped the whole table out for a paragraph
 * ("sku_stock.stock equals SUM(sku_stock_ledger.delta) for every SKU. The
 * trigger is working."). That sentence is the desk's settled-with-no-rows
 * answer, so it is the default {@link DataTable} `emptyMessage` here — the
 * table stays mounted, the headers and the Fields menu stay reachable, and
 * there is no branch that replaces a collection with prose.
 *
 * ## Why sort and search are local state here
 *
 * `/inventory/health` is a diagnostics dashboard with SIX row sections on one
 * page and no search params of its own — two sections writing the same `?sort=`
 * would fight, and a header click would round-trip a `force-dynamic` server
 * component to reorder twenty-five rows the client already holds.
 */

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
