'use client';

/** **Unit-TSN-links spreadsheet** — the family glue that resolves a {@link DataTable} feed bag. */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import { resolveUnitTsnLinksSlotValue } from '@/lib/tables/field-catalog/unit-tsn-links-resolve';
import type { UnitTsnLinkTableRow } from '@/lib/inventory/tsn-link-row';
import { unitTsnLinksCompoundView } from './unit-tsn-links-row-view';
import {
  unitTsnLinksSortFactFor,
  type UnitTsnLinksGridColumn,
  type UnitTsnLinksGridColumnKey,
} from './unit-tsn-links-grid-layout';
import {
  UNIT_TSN_LINKS_GRID_CAPABILITIES,
  UNIT_TSN_LINKS_TABLE_BINDING,
} from './unit-tsn-links-table-definition';

interface UseUnitTsnLinksSpreadsheetOptions {
  /** The feed. Already ordered by the API; a header click re-orders it. */
  rows: readonly UnitTsnLinkTableRow[];
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
}

export function useUnitTsnLinksSpreadsheet({
  rows,
  loading = false,
  /** The empty state the retired hand table did not have: */
  emptyMessage = 'No v1 tech_serial_numbers record references this unit.',
  searchPlaceholder = 'Filter TSN records…',
}: UseUnitTsnLinksSpreadsheetOptions): CompoundSpreadsheetFeed<
  UnitTsnLinkTableRow,
  UnitTsnLinksGridColumnKey,
  UnitTsnLinksGridColumn
> {
  const [sort, setSort] = useState<UnitTsnLinksGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);
  const [query, setQuery] = useState('');




  const onSortChange = useCallback(
    (key: UnitTsnLinksGridColumnKey, nextDir: 'asc' | 'desc') => {
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
    UnitTsnLinkTableRow,
    UnitTsnLinksGridColumnKey,
    UnitTsnLinksGridColumn
  >({
    binding: UNIT_TSN_LINKS_TABLE_BINDING,
    columns: UNIT_TSN_LINKS_TABLE_BINDING.columns,
    rows,
    getRowId: (row) => String(row.id),
    adapter: unitTsnLinksCompoundView,
    resolve: resolveUnitTsnLinksSlotValue,
    sortFactFor: unitTsnLinksSortFactFor,
    capabilities: UNIT_TSN_LINKS_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange,
    search,
    loading,
    emptyMessage,
    ariaLabel: 'Tech serial number links',
  });
}
