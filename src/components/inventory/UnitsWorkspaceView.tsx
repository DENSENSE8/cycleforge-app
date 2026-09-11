'use client';

/**
 * Inventory › Units browse workspace — the ops-queue Sheets golden applied to
 * the units collection (Wave 0 of the SoT page-violation migrate). Flush sheet
 * chrome over DataTable via {@link useUnitsSpreadsheet}, mounted at
 * `/inventory/units`.
 *
 * Row click opens the unit in the `RightRailHost` push inspector
 * (`InventoryInspectorRail`, keyed on `?open=unit:<ref>` via
 * `useInventoryOpenParam`).
 */

import { useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import { DataTable } from '@/components/tables/DataTable';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import { useWorkbenchSearchParam } from '@/hooks/useWorkbenchSearchParam';
import { serializeInventoryOpenKey } from '@/lib/inventory-events-channel';
import { InventoryInspectorRail } from './InventoryInspectorRail';
import { useInventoryOpenParam } from './useInventoryOpenParam';
import { useUnitsOverview, type UnitsOverviewRow } from '@/hooks/useUnitsOverview';
import { useUnitsSpreadsheet } from './units-grid/useUnitsSpreadsheet';
import {
  defaultDirForUnitsColumn,
  isUnitsColumnSortable,
  unitsSheetColumnsFor,
  type UnitsGridColumnKey,
} from './units-grid/units-grid-layout';
import { useUnitsTableLayout } from './units-grid/useUnitsTableLayout';

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function UnitsWorkspaceView() {
  const searchParams = useSearchParams();

  const q = (searchParams.get('q') ?? '').trim();
  const states = useMemo(() => parseList(searchParams.get('state')), [searchParams]);
  const conditions = useMemo(() => parseList(searchParams.get('condition')), [searchParams]);

  const { rows, loading } = useUnitsOverview({ q, states, conditions });

  const { selection, setOpen } = useInventoryOpenParam();
  const closeInspector = useCallback(() => setOpen(null), [setOpen]);

  const onRowClick = useCallback(
    (row: UnitsOverviewRow) => {
      const ref = row.serial_number ?? String(row.id);
      setOpen(serializeInventoryOpenKey('unit', ref));
    },
    [setOpen],
  );

  const scrollRef = useRef<HTMLDivElement>(null);

  const { effectiveLayout: unitsLayout } = useUnitsTableLayout();
  const columns = useMemo(() => unitsSheetColumnsFor(unitsLayout), [unitsLayout]);

  const {
    sort: columnSort,
    dir: sortDir,
    setSort,
  } = useUrlColumnSort<UnitsGridColumnKey>({
    isColumn: (raw) => isUnitsColumnSortable(columns, raw),
    defaultDir: (key) => defaultDirForUnitsColumn(columns, key),
  });

  const { searchQuery, setSearch } = useWorkbenchSearchParam();

  const sheet = useUnitsSpreadsheet({
    rows,
    loading,
    search: { value: searchQuery, onChange: setSearch, placeholder: 'Filter units…' },
    sort: columnSort,
    dir: sortDir,
    onSortChange: setSort,
    onOpen: onRowClick,
    scrollRef,
  });

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col">
      <DashboardScrollShell className="h-full overflow-y-hidden bg-transparent">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <DataTable {...sheet} />
        </div>
      </DashboardScrollShell>

      <InventoryInspectorRail selection={selection} onClose={closeInspector} />
    </div>
  );
}
