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
 * ## Why sort is local state here — and when the find text is not
 *
 * Sort stays local in every mount: these are PANES as often as routes (the SKU
 * detail page stacks five of them, and two ledgers on one screen writing the
 * same `?sort=` would fight). Durability in the URL is the rule for a lane that
 * IS a page (see `useQueueDisplaySort`); it is not a rule for a pane, and a
 * shared param would be the fork.
 *
 * The find text splits on one question: IS THIS FEED THE WHOLE ANSWER? The SKU
 * detail timeline and the admin's recent-events strip hold all of their rows,
 * pass no {@link search}, and get the local box over the feed in hand.
 *
 * The three WINDOWED mounts — `/inventory/events` (one offset page of 100 out
 * of thousands), the Ledger's last-50 org feed (`PulseView`) and one unit's
 * last-200 chain of custody (`PulseWorkspace`) — pass the whole
 * `DataTableSearch` instead and carry the text on their own fetch key. The
 * `answeredBy: 'server'` flag in that object is load-bearing twice over:
 * without it the engine re-filters a page it cannot see past, AND it re-filters
 * against the MOUNTED tracks only — which would delete the hits
 * `/api/inventory-events?q=` finds in the joined tables (the catalog title, the
 * serial, both bin names, the actor), none of which every layout paints.
 */

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
  /**
   * A caller-owned find box, for a mount whose feed is ONE WINDOW of a larger
   * set. Pass the whole {@link DataTableSearch}, not a three-field subset: the
   * point of this seam is `answeredBy: 'server'`, and a narrower type would
   * silently drop the flag that stops the engine re-filtering a set it cannot
   * see all of.
   *
   * Omitted by the two mounts whose feed is already complete in the browser —
   * the SKU detail timeline and the `/inventory/health` recent-events strip —
   * which get the local box below; see the module docblock.
   * `searchPlaceholder` is that local box's wording and is ignored when this is
   * passed, because the caller's object carries its own.
   */
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
