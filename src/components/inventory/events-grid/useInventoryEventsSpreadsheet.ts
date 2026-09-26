'use client';

/** **Inventory-events spreadsheet** — the family glue that resolves a {@link DataTable} feed bag for the ledger. */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import type { DataTableSearch } from '@/components/tables/DataTable';
import { resolveInventoryEventsSlotValue } from '@/lib/tables/field-catalog/inventory-events-resolve';
import { inventoryEventCompoundView } from '@/lib/inventory/inventory-events-row-adapter';
import type { PulseEventRow } from '@/components/inventory/types';
import { INVENTORY_EVENTS_GRID_CAPABILITIES } from './inventory-events-grid-descriptor';
import {
  inventoryEventsCompoundColumnsFor,
  inventoryEventsSortFactFor,
  type InventoryEventsGridColumn,
  type InventoryEventsGridColumnKey,
} from './inventory-events-grid-layout';
import { INVENTORY_EVENTS_TABLE_BINDING } from './inventory-events-table-definition';
import { useInventoryEventsTableLayout } from './useInventoryEventsTableLayout';

export interface UseInventoryEventsSpreadsheetOptions {
  /** The feed. Already ordered by the caller; a header click re-orders it. */
  events: readonly PulseEventRow[];
  /** A caller-owned find box, for a mount whose feed is ONE WINDOW of a larger set. */
  search?: DataTableSearch;
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
}

export function useInventoryEventsSpreadsheet({
  events,
  search: searchOverride,
  loading = false,
  emptyMessage = 'No inventory events yet.',
  searchPlaceholder = 'Filter activity…',
}: UseInventoryEventsSpreadsheetOptions): CompoundSpreadsheetFeed<
  PulseEventRow,
  InventoryEventsGridColumnKey,
  InventoryEventsGridColumn
> {
  const [sort, setSort] = useState<InventoryEventsGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);
  const [query, setQuery] = useState('');

  const { effectiveLayout, subtitleFieldIds, fields } = useInventoryEventsTableLayout();
  const columns = useMemo(
    () => inventoryEventsCompoundColumnsFor(effectiveLayout),
    [effectiveLayout],
  );

  const onSortChange = useCallback(
    (key: InventoryEventsGridColumnKey, nextDir: 'asc' | 'desc') => {
      setSort(key);
      setDir(nextDir);
    },
    [],
  );

  const localSearch = useMemo<DataTableSearch>(
    () => ({ value: query, onChange: setQuery, placeholder: searchPlaceholder }),
    [query, searchPlaceholder],
  );
  const search = searchOverride ?? localSearch;

  return useCompoundSpreadsheet<
    PulseEventRow,
    InventoryEventsGridColumnKey,
    InventoryEventsGridColumn
  >({
    binding: INVENTORY_EVENTS_TABLE_BINDING,
    columns,
    fields,
    rows: events,
    getRowId: (row) => String(row.id),
    adapter: inventoryEventCompoundView,
    subtitleFieldIds,
    resolve: resolveInventoryEventsSlotValue,
    sortFactFor: inventoryEventsSortFactFor,
    capabilities: INVENTORY_EVENTS_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange,
    search,
    loading,
    emptyMessage,
    ariaLabel: 'Inventory ledger activity',
  });
}
