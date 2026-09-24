'use client';

/**
 * The Tech / Packer bench feed — one hook, two families.
 *
 * Wave C of the slot-table port (`docs/todo/prod-slot-table-SOT-HANDOFF.md`).
 * The benches were the last third display engine: `StationHistoryTable` →
 * `StationListTable` → a raw `LedgerGrid` painting the hand
 * `STATION_HISTORY_COLUMNS` array, outside `PRODUCT_TABLES` and
 * `REGISTERED_BINDINGS`. They now mount the ONE engine through
 * {@link useCompoundSpreadsheet}, exactly like every other compound family.
 *
 * `family` selects the registration (binding · columns · resolver · sort
 * vocabulary) as DATA. It is not a conditional hook: the caller owns the layout
 * hook for its own desk — `TechTable` calls `useTechTableLayout`, `PackerTable`
 * calls `usePackerTableLayout` — and hands the resolved layout in, so neither
 * desk pays for the other's prefs read and nothing here branches on hooks.
 *
 * The bench row is a `QueueRowRecord`: `record-to-queue-row.ts` maps a
 * `TechRecord` / `PackerRecord` into it, and the original record rides along so
 * the caller's row-open and copy recover the domain object without a refetch.
 */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import type { QueueRowRecord } from '@/components/dashboard/orders-queue/helpers';
import type { OrdersQueueColumn, OrdersQueueColumnKey } from '@/lib/dashboard-order-row-layout';
import type { SlotTableLayout } from '@/components/tables/useSlotTableLayout';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import { benchRowCompoundView } from '@/components/station/bench-grid/bench-row-view';
import {
  PACKER_COMPOUND_COLUMNS,
  TECH_COMPOUND_COLUMNS,
  packerCompoundColumnsFor,
  packerSortFactFor,
  techCompoundColumnsFor,
  techSortFactFor,
} from '@/components/station/bench-grid/bench-grid-layout';
import {
  PACKER_GRID_CAPABILITIES,
  PACKER_TABLE_BINDING,
  TECH_GRID_CAPABILITIES,
  TECH_TABLE_BINDING,
} from '@/components/station/bench-grid/bench-table-definition';
import { resolveTechSlotValue } from '@/lib/tables/field-catalog/tech-resolve';
import { resolvePackerSlotValue } from '@/lib/tables/field-catalog/packer-resolve';

export type BenchFamily = 'tech' | 'packer';

/** Everything that differs between the two benches, as data. */
const BENCH_REGISTRATION = {
  tech: {
    binding: TECH_TABLE_BINDING,
    capabilities: TECH_GRID_CAPABILITIES,
    columnsFor: techCompoundColumnsFor,
    productColumns: TECH_COMPOUND_COLUMNS,
    resolve: resolveTechSlotValue,
    sortFactFor: techSortFactFor,
    ariaLabel: 'Tech bench history',
    searchPlaceholder: 'Filter tested…',
  },
  packer: {
    binding: PACKER_TABLE_BINDING,
    capabilities: PACKER_GRID_CAPABILITIES,
    columnsFor: packerCompoundColumnsFor,
    productColumns: PACKER_COMPOUND_COLUMNS,
    resolve: resolvePackerSlotValue,
    sortFactFor: packerSortFactFor,
    ariaLabel: 'Packer bench history',
    searchPlaceholder: 'Filter packed…',
  },
} as const;

export interface UseBenchSpreadsheetOptions {
  family: BenchFamily;
  /** The caller's own `use*TableLayout()` result — one prefs read per desk. */
  layout: SlotTableLayout;
  rows: readonly QueueRowRecord[];
  loading: boolean;
  emptyMessage: string;
  /** Present ⇒ the title hover carries "Open" and a row click reports it. */
  onOpenRow?: (row: QueueRowRecord) => void;
  /**
   * The find box, ANSWERED BY THE SERVER — owned by the desk, not by this hook.
   *
   * It used to be `useState('')` right here, and the engine filtered the
   * mounted rows with it. Bench rows arrive WINDOWED (`/api/packerlogs`,
   * `/api/tech/logs`), so that pass could only ever search the newest page: a
   * pack or a test from earlier in the same week answered "no results" for a
   * tracking number the operator was holding. The state now lives in the
   * controller, where it can reach the fetch key — which is why `value` and
   * `onChange` arrive from outside and `answeredBy` below is not negotiable.
   */
  search: {
    value: string;
    onChange: (value: string) => void;
    /** A request for the CURRENT `value` is in flight (`query.isFetching`). */
    pending: boolean;
  };
}

export function useBenchSpreadsheet({
  family,
  layout,
  rows,
  loading,
  emptyMessage,
  onOpenRow,
  search: searchInput,
}: UseBenchSpreadsheetOptions): CompoundSpreadsheetFeed<
  QueueRowRecord,
  OrdersQueueColumnKey,
  OrdersQueueColumn
> {
  const registration = BENCH_REGISTRATION[family];
  const [sort, setSort] = useState<OrdersQueueColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);

  const columns = useMemo(
    () => registration.columnsFor(layout.effectiveLayout) ?? registration.productColumns,
    [registration, layout.effectiveLayout],
  );

  const onSortChange = useCallback((key: OrdersQueueColumnKey, nextDir: 'asc' | 'desc') => {
    setSort(key);
    setDir(nextDir);
  }, []);

  const search = useMemo(
    () => ({
      value: searchInput.value,
      onChange: searchInput.onChange,
      placeholder: registration.searchPlaceholder,
      // `rows` ARE the answer for `value`, so the engine's substring pass is
      // bypassed rather than run a second, narrower time over a windowed set.
      answeredBy: 'server' as const,
      pending: searchInput.pending,
    }),
    [searchInput.value, searchInput.onChange, searchInput.pending, registration.searchPlaceholder],
  );

  return useCompoundSpreadsheet<QueueRowRecord, OrdersQueueColumnKey, OrdersQueueColumn>({
    binding: registration.binding,
    columns,
    fields: layout.fields,
    rows,
    getRowId: (row) => String(row.id),
    adapter: benchRowCompoundView,
    subtitleFieldIds: layout.subtitleFieldIds,
    resolve: registration.resolve,
    sortFactFor: registration.sortFactFor,
    capabilities: registration.capabilities,
    sort,
    dir,
    onSortChange,
    search,
    loading,
    emptyMessage,
    ariaLabel: registration.ariaLabel,
    onOpenRow,
  });
}
