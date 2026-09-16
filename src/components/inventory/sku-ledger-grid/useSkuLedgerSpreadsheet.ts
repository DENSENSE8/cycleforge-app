'use client';

/**
 * **Stock-ledger spreadsheet** — the family glue that resolves a
 * {@link DataTable} feed bag. Spread it onto the host; there is no second table
 * component.
 *
 * ```tsx
 * const sheet = useSkuLedgerSpreadsheet({ rows });
 * return <DataTable {...sheet} totalCount={rows.length} />;
 * ```
 *
 * This is the whole of the port's display code, and it is a `.ts` file: the
 * engine paints the rows, so the family contributes a catalog, a resolver, an
 * adapter and a column array — and nothing else.
 *
 * ## Why sort and search are local state here
 *
 * This is a PANE on `/inventory/health/sku/[sku]`, which renders five row
 * sections, and the feed it is handed is the server's `LIMIT 100` window. A
 * header click writing `?sort=` would fight the other panes for one channel and
 * would re-run the page's eight loaders to reorder a hundred rows the client
 * already holds — and it would reorder the WINDOW, not the ledger, which is a
 * different answer wearing the same arrow. Durability in the URL is the rule
 * for a lane that IS a page; it is not a rule for a pane (the same rule
 * `SkuDetailTables` and the Ledger's two mounts already follow).
 */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import { resolveSkuLedgerSlotValue } from '@/lib/tables/field-catalog/sku-ledger-resolve';
import type { SkuLedgerTableRow } from '@/lib/inventory/sku-ledger-row';
import { skuLedgerCompoundView } from './sku-ledger-row-view';
import {
  skuLedgerCompoundColumnsFor,
  skuLedgerSortFactFor,
  type SkuLedgerGridColumn,
  type SkuLedgerGridColumnKey,
} from './sku-ledger-grid-layout';
import {
  SKU_LEDGER_GRID_CAPABILITIES,
  SKU_LEDGER_TABLE_BINDING,
} from './sku-ledger-table-definition';
import { useSkuLedgerTableLayout } from './useSkuLedgerTableLayout';

export interface UseSkuLedgerSpreadsheetOptions {
  /** One server window (the last hundred movements), newest first. */
  rows: readonly SkuLedgerTableRow[];
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
}

export function useSkuLedgerSpreadsheet({
  rows,
  loading = false,
  emptyMessage = 'No ledger entries for this SKU yet.',
  searchPlaceholder = 'Filter this page…',
}: UseSkuLedgerSpreadsheetOptions): CompoundSpreadsheetFeed<
  SkuLedgerTableRow,
  SkuLedgerGridColumnKey,
  SkuLedgerGridColumn
> {
  const [sort, setSort] = useState<SkuLedgerGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);
  const [query, setQuery] = useState('');

  const { effectiveLayout, subtitleFieldIds, fields } = useSkuLedgerTableLayout();
  const columns = useMemo(() => skuLedgerCompoundColumnsFor(effectiveLayout), [effectiveLayout]);

  const onSortChange = useCallback((key: SkuLedgerGridColumnKey, nextDir: 'asc' | 'desc') => {
    setSort(key);
    setDir(nextDir);
  }, []);

  const search = useMemo(
    () => ({ value: query, onChange: setQuery, placeholder: searchPlaceholder }),
    [query, searchPlaceholder],
  );

  return useCompoundSpreadsheet<SkuLedgerTableRow, SkuLedgerGridColumnKey, SkuLedgerGridColumn>({
    binding: SKU_LEDGER_TABLE_BINDING,
    columns,
    fields,
    rows,
    getRowId: (row) => String(row.id),
    adapter: skuLedgerCompoundView,
    subtitleFieldIds,
    resolve: resolveSkuLedgerSlotValue,
    sortFactFor: skuLedgerSortFactFor,
    capabilities: SKU_LEDGER_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange,
    search,
    loading,
    emptyMessage,
    ariaLabel: 'Stock ledger',
  });
}
