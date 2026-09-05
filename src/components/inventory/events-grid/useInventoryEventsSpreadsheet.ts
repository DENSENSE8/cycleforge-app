'use client';

/**
 * **Inventory-events spreadsheet** — the family glue that resolves a
 * {@link DataTable} feed bag for the ledger. Spread it onto the host; there is
 * no second table component.
 *
 * ```tsx
 * const sheet = useInventoryEventsSpreadsheet({ events, loading });
 * return <DataTable {...sheet} />;
 * ```
 *
 * This is the whole of the port's display code, and it is a `.ts` file: the
 * engine paints the rows ({@link useCompoundSpreadsheet} → `CompoundRow` →
 * `CompoundCells`), so the family contributes an adapter, a resolver and a
 * column array and nothing else. It replaced `InventoryEventsTable.tsx` (a
 * host) and `events-grid/cells/index.tsx` (a per-family cell map), both of
 * which invariant 1 of `table-engine-law.ts` names outright.
 *
 * Two feeds already prove the seam — the Ledger's last-50 org feed
 * (`PulseView`) and one unit's chain of custody (`PulseWorkspace`). A third
 * feed is a `rows` prop, not a table.
 *
 * ## Why sort and search are local state here
 *
 * Both mounts are PANES, not routes: `PulseWorkspace` shows one unit's history
 * beside the sidebar selection that `?open=` already owns, and two ledgers on
 * one screen writing the same `?sort=` would fight. Durability in the URL is
 * the rule for a lane that IS a page (see `useQueueDisplaySort`); it is not a
 * rule for a pane, and a shared param would be the fork.
 */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
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
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
}

export function useInventoryEventsSpreadsheet({
  events,
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

  const { effectiveLayout, fields } = useInventoryEventsTableLayout();
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

  const search = useMemo(
    () => ({ value: query, onChange: setQuery, placeholder: searchPlaceholder }),
    [query, searchPlaceholder],
  );

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
