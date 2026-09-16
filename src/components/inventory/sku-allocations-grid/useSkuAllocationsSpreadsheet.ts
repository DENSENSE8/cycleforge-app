'use client';

/**
 * **Per-SKU allocations spreadsheet** — this mount's glue onto the shared
 * {@link useCompoundSpreadsheet}. Spread it onto `DataTable`; there is no
 * second table component and no second allocations family.
 *
 * ```tsx
 * const sheet = useSkuAllocationsSpreadsheet({ rows, onOpenRow: openUnit });
 * return <DataTable {...sheet} totalCount={rows.length} />;
 * ```
 *
 * Everything that decides how an allocation READS is imported from the
 * registered family: `unitAllocationsCompoundColumnsFor` (materializer),
 * `unitAllocationsSortFactFor` (header sort), `unitAllocationsCompoundView`
 * (adapter), `resolveUnitAllocationsSlotValue` (resolver) and
 * `UNIT_ALLOCATIONS_GRID_CAPABILITIES`. What is local is this desk's binding
 * (its own definition id + record plane) and its own layout document.
 *
 * ## Why this is not a parameter on the unit desk's hook
 *
 * It could have been — one more option on `useUnitAllocationsSpreadsheet`. It
 * is not, because the two mounts differ in the two things a FEED hook resolves
 * for the engine: which binding (this one navigates to the unit; that one has
 * no record plane) and which layout document. A hook taking both as arguments
 * would be a switch over desks living in the family, which is the shape law §2
 * rules out. The family's DISPLAY code stays single; the mounts stay separate.
 *
 * ## Why sort and search are local state here
 *
 * This is a PANE on `/inventory/health/sku/[sku]`, which renders five row
 * sections. Two panes writing the same `?sort=` would fight — the rule the
 * per-SKU islands, the Ledger's two mounts and the unit desk's own allocations
 * pane already follow.
 */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import { resolveUnitAllocationsSlotValue } from '@/lib/tables/field-catalog/unit-allocations-resolve';
import type { UnitAllocationTableRow } from '@/lib/inventory/unit-allocation-row';
import { unitAllocationsCompoundView } from '@/components/inventory/allocations-grid/unit-allocations-row-view';
import {
  unitAllocationsCompoundColumnsFor,
  unitAllocationsSortFactFor,
  type UnitAllocationsGridColumn,
  type UnitAllocationsGridColumnKey,
} from '@/components/inventory/allocations-grid/unit-allocations-grid-layout';
import { UNIT_ALLOCATIONS_GRID_CAPABILITIES } from '@/components/inventory/allocations-grid/unit-allocations-table-definition';
import { SKU_ALLOCATIONS_TABLE_BINDING } from './sku-allocations-table-definition';
import { useSkuAllocationsTableLayout } from './useSkuAllocationsTableLayout';

export interface UseSkuAllocationsSpreadsheetOptions {
  /** The open holds on this SKU's units. Already ordered; a header click re-orders it. */
  rows: readonly UnitAllocationTableRow[];
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
  /** The binding's `navigate` record plane, wired to the router by the mount. */
  onOpenRow?: (row: UnitAllocationTableRow) => void;
}

export function useSkuAllocationsSpreadsheet({
  rows,
  loading = false,
  /**
   * The empty state the retired table did not have: it was wrapped in
   * `allocations.length > 0 ?` and the whole section vanished, so "nothing is
   * holding this stock" and "this panel does not exist" read identically.
   */
  emptyMessage = 'No open allocations — nothing is holding this SKU.',
  searchPlaceholder = 'Filter allocations…',
  onOpenRow,
}: UseSkuAllocationsSpreadsheetOptions): CompoundSpreadsheetFeed<
  UnitAllocationTableRow,
  UnitAllocationsGridColumnKey,
  UnitAllocationsGridColumn
> {
  const [sort, setSort] = useState<UnitAllocationsGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);
  const [query, setQuery] = useState('');

  const { effectiveLayout, subtitleFieldIds, fields } = useSkuAllocationsTableLayout();
  const columns = useMemo(
    () => unitAllocationsCompoundColumnsFor(effectiveLayout),
    [effectiveLayout],
  );

  const onSortChange = useCallback(
    (key: UnitAllocationsGridColumnKey, nextDir: 'asc' | 'desc') => {
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
    UnitAllocationTableRow,
    UnitAllocationsGridColumnKey,
    UnitAllocationsGridColumn
  >({
    binding: SKU_ALLOCATIONS_TABLE_BINDING,
    columns,
    fields,
    rows,
    getRowId: (row) => String(row.id),
    adapter: unitAllocationsCompoundView,
    subtitleFieldIds,
    resolve: resolveUnitAllocationsSlotValue,
    sortFactFor: unitAllocationsSortFactFor,
    capabilities: UNIT_ALLOCATIONS_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange,
    search,
    loading,
    emptyMessage,
    ariaLabel: 'Open allocations',
    onOpenRow,
  });
}
