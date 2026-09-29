'use client';

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import { useCompoundSpreadsheet, type CompoundSpreadsheetFeed } from '@/components/tables/useCompoundSpreadsheet';
import type { CatalogListRow } from '@/components/products/catalog/types';
import { resolveCatalogSlotValue } from '@/lib/tables/field-catalog/catalog-resolve';
import { catalogCompoundView } from './catalog-compound-row-view';
import {
  catalogCompoundColumnsFor,
  catalogCompoundSortFactFor,
  type CatalogGridColumn,
  type CatalogGridColumnKey,
} from './catalog-compound-grid-layout';
import { CATALOG_GRID_CAPABILITIES } from './catalog-grid-descriptor';
import { CATALOG_TABLE_BINDING } from './catalog-table-definition';
import { useCatalogTableLayout } from './useCatalogTableLayout';

export function useCatalogSpreadsheet({
  rows,
  loading,
  find,
  onOpenRow,
}: {
  rows: readonly CatalogListRow[];
  loading: boolean;
  find: string;
  onOpenRow: (row: CatalogListRow) => void;
}): CompoundSpreadsheetFeed<CatalogListRow, CatalogGridColumnKey, CatalogGridColumn> {
  const [sort, setSort] = useState<CatalogGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);
  const { effectiveLayout, subtitleFieldIds, fields } = useCatalogTableLayout();
  const columns = useMemo(() => catalogCompoundColumnsFor(effectiveLayout), [effectiveLayout]);
  const onSortChange = useCallback((key: CatalogGridColumnKey, nextDir: 'asc' | 'desc') => {
    setSort(key);
    setDir(nextDir);
  }, []);

  return useCompoundSpreadsheet({
    binding: CATALOG_TABLE_BINDING,
    columns,
    fields,
    rows,
    getRowId: (row) => String(row.id),
    adapter: catalogCompoundView,
    subtitleFieldIds,
    adapterPaintedFieldIds: ['catalog.title', 'catalog.platforms', 'catalog.item_numbers', 'catalog.category'],
    resolve: resolveCatalogSlotValue,
    sortFactFor: catalogCompoundSortFactFor,
    capabilities: CATALOG_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange,
    search: { value: find, onChange: () => undefined, answeredBy: 'server' },
    findOwner: 'page',
    loading,
    emptyMessage: 'No products match this catalog search.',
    ariaLabel: 'All products',
    onOpenRow,
  });
}
