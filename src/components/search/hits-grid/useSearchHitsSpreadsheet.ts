'use client';

/**
 * **Find-plane spreadsheet** — the family glue that resolves a
 * {@link DataTable} feed bag for `/search` results. Spread it onto the host;
 * there is no second table component.
 *
 * ```tsx
 * const sheet = useSearchHitsSpreadsheet({ hits, onOpenHit });
 * return <DataTable {...sheet} totalCount={hits.length} />;
 * ```
 *
 * This is the whole of the port's display code, and it is a `.ts` file: the
 * engine paints the rows, so the family contributes a catalog, a resolver, an
 * adapter and a column array — and nothing else.
 *
 * ## Why the header sort is LOCAL state here
 *
 * The rule is that sort durability belongs in the URL — and on this route the
 * URL channel for ordering is already occupied. `?colsort=` is the browse
 * toolbar's RANKING switch (relevance | date, `SEARCH_SORT_PARAM`), which is
 * not a column sort at all: relevance is not a column, and the switch ships no
 * `?coldir=` companion because a two-option ranking has no direction. A header
 * click writing the same key would fight it for one channel.
 *
 * So the two compose instead of colliding: the toolbar chooses the order the
 * rows ARRIVE in, and a header click re-orders what arrived. The sort is a
 * state SETTER, never a constant — passing a frozen `sort` is the dead-header
 * fork that made Shipped's headers inert.
 */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import { resolveSearchHitsSlotValue } from '@/lib/tables/field-catalog/search-hits-resolve';
import type { AiSearchHit } from '@/lib/search/ai-search-client';
import { searchHitRowId, searchHitsCompoundView } from './search-hits-row-view';
import {
  searchHitsCompoundColumnsFor,
  searchHitsSortFactFor,
  type SearchHitsGridColumn,
  type SearchHitsGridColumnKey,
} from './search-hits-grid-layout';
import {
  SEARCH_HITS_GRID_CAPABILITIES,
  SEARCH_HITS_TABLE_BINDING,
} from './search-hits-table-definition';
import { useSearchHitsTableLayout } from './useSearchHitsTableLayout';

export interface UseSearchHitsSpreadsheetOptions {
  /** The refined, ranked hit list. A header click re-orders it. */
  hits: readonly AiSearchHit[];
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
  /** The handoff — writes `?sel=` on this route. See the binding's recordPlane. */
  onOpenHit?: (hit: AiSearchHit) => void;
}

export function useSearchHitsSpreadsheet({
  hits,
  loading = false,
  emptyMessage = 'Nothing in orders, units, cartons, SKUs, repairs or FBA matched this query.',
  searchPlaceholder = 'Filter results…',
  onOpenHit,
}: UseSearchHitsSpreadsheetOptions): CompoundSpreadsheetFeed<
  AiSearchHit,
  SearchHitsGridColumnKey,
  SearchHitsGridColumn
> {
  const [sort, setSort] = useState<SearchHitsGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);
  const [query, setQuery] = useState('');

  const { effectiveLayout, subtitleFieldIds, fields } = useSearchHitsTableLayout();
  const columns = useMemo(() => searchHitsCompoundColumnsFor(effectiveLayout), [effectiveLayout]);

  const onSortChange = useCallback((key: SearchHitsGridColumnKey, nextDir: 'asc' | 'desc') => {
    setSort(key);
    setDir(nextDir);
  }, []);

  const search = useMemo(
    () => ({ value: query, onChange: setQuery, placeholder: searchPlaceholder }),
    [query, searchPlaceholder],
  );

  const rows = useMemo(() => [...hits], [hits]);

  return useCompoundSpreadsheet<AiSearchHit, SearchHitsGridColumnKey, SearchHitsGridColumn>({
    binding: SEARCH_HITS_TABLE_BINDING,
    columns,
    fields,
    rows,
    getRowId: searchHitRowId,
    adapter: searchHitsCompoundView,
    subtitleFieldIds,
    resolve: resolveSearchHitsSlotValue,
    sortFactFor: searchHitsSortFactFor,
    capabilities: SEARCH_HITS_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange,
    search,
    loading,
    emptyMessage,
    onOpenRow: onOpenHit,
    ariaLabel: 'Search results',
  });
}
