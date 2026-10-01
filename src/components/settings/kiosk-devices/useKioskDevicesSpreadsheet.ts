'use client';

/** **Kiosk devices spreadsheet** — the family glue that resolves a {@link DataTable} feed bag. */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import type { CompoundRowAction } from '@/components/tables/compound/compound-row-model';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import { resolveKioskDevicesSlotValue } from '@/lib/tables/field-catalog/kiosk-devices-resolve';
import { kioskDeviceCompoundView } from '@/lib/kiosk/kiosk-device-row-adapter';
import type { KioskDeviceTableRow } from '@/lib/kiosk/kiosk-device-row';
import { KIOSKDEVICES_GRID_CAPABILITIES } from './kiosk-devices-grid-descriptor';
import {
  kioskDevicesSortFactFor,
  type KioskDevicesGridColumn,
  type KioskDevicesGridColumnKey,
} from './kiosk-devices-grid-layout';
import { KIOSKDEVICES_TABLE_BINDING } from './kiosk-devices-table-definition';

interface UseKioskDevicesSpreadsheetOptions {
  rows: readonly KioskDeviceTableRow[];
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
  /** The family's row verbs, resolved per row. See `useCompoundSpreadsheet`. */
  rowActions?: (row: KioskDeviceTableRow) => readonly CompoundRowAction[];
}

export function useKioskDevicesSpreadsheet({
  rows,
  loading = false,
  emptyMessage = 'No kiosk devices enrolled.',
  searchPlaceholder = 'Filter devices…',
  rowActions,
}: UseKioskDevicesSpreadsheetOptions): CompoundSpreadsheetFeed<
  KioskDeviceTableRow,
  KioskDevicesGridColumnKey,
  KioskDevicesGridColumn
> {
  const [sort, setSort] = useState<KioskDevicesGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);
  const [query, setQuery] = useState('');




  const onSortChange = useCallback((key: KioskDevicesGridColumnKey, nextDir: 'asc' | 'desc') => {
    setSort(key);
    setDir(nextDir);
  }, []);

  const search = useMemo(
    () => ({ value: query, onChange: setQuery, placeholder: searchPlaceholder }),
    [query, searchPlaceholder],
  );

  return useCompoundSpreadsheet<KioskDeviceTableRow, KioskDevicesGridColumnKey, KioskDevicesGridColumn>({
    binding: KIOSKDEVICES_TABLE_BINDING,
    columns: KIOSKDEVICES_TABLE_BINDING.columns,
    rows,
    getRowId: (row) => String(row.id),
    adapter: kioskDeviceCompoundView,
    resolve: resolveKioskDevicesSlotValue,
    sortFactFor: kioskDevicesSortFactFor,
    capabilities: KIOSKDEVICES_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange,
    search,
    loading,
    emptyMessage,
    ariaLabel: 'Kiosk devices',
    rowActions,
  });
}
