'use client';

/** The Tech / Packer bench feed — one hook, two families. */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import type { QueueRowRecord } from '@/components/dashboard/orders-queue/helpers';
import type { OrdersQueueColumn, OrdersQueueColumnKey } from '@/lib/dashboard-order-row-layout';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import { benchRowCompoundView } from '@/components/station/bench-grid/bench-row-view';
import {
  packerSortFactFor,
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
    resolve: resolveTechSlotValue,
    sortFactFor: techSortFactFor,
    ariaLabel: 'Tech bench history',
    searchPlaceholder: 'Filter tested…',
  },
  packer: {
    binding: PACKER_TABLE_BINDING,
    capabilities: PACKER_GRID_CAPABILITIES,
    resolve: resolvePackerSlotValue,
    sortFactFor: packerSortFactFor,
    ariaLabel: 'Packer bench history',
    searchPlaceholder: 'Filter packed…',
  },
} as const;

interface UseBenchSpreadsheetOptions {
  family: BenchFamily;
  rows: readonly QueueRowRecord[];
  loading: boolean;
  emptyMessage: string;
  /** Present ⇒ the title hover carries "Open" and a row click reports it. */
  onOpenRow?: (row: QueueRowRecord) => void;
  /** The find box, ANSWERED BY THE SERVER — owned by the desk, not by this hook. */
  search: {
    value: string;
    onChange: (value: string) => void;
    /** A request for the CURRENT `value` is in flight (`query.isFetching`). */
    pending: boolean;
  };
}

export function useBenchSpreadsheet({
  family,
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

  const columns = registration.binding.columns;

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
    rows,
    getRowId: (row) => String(row.id),
    adapter: benchRowCompoundView,
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
