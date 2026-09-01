'use client';

/**
 * Inventory › Units browse workspace — the ops-queue Sheets golden applied to
 * the units collection (Wave 0 of the SoT page-violation migrate). Flush sheet
 * chrome (`'relative w-full min-w-0'` Band 1) over `NonlinearTableHost` +
 * `UNITS_TABLE_BINDING` in `'relative flex min-h-0 min-w-0 flex-1 flex-col'`, mounted at `/inventory/units`.
 *
 * Row click opens the unit in the `RightRailHost` push inspector
 * (`InventoryInspectorRail`, keyed on `?open=unit:<ref>` via
 * `useInventoryOpenParam`) — Wave 1 broke the keystone coupling to the legacy
 * `InventoryShell`, so the units route no longer routes any record through the
 * retired shell's by-unit viewport.
 *
 * Still Phase B: Band 2 (KPI), Band 3 (find + Refine + Show/Hide inspector) and
 * the left `useSavedViews` rail land once the shared `InventoryShell` /
 * `useInventoryUrlState` files (currently dirty in a parallel session) are clean
 * to swap.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import { DataTable } from '@/components/tables/DataTable';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import { useWorkbenchSearchParam } from '@/hooks/useWorkbenchSearchParam';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import type { RowGroup } from '@/lib/group-rows';
import { serializeInventoryOpenKey } from '@/lib/inventory-events-channel';
import { InventoryInspectorRail } from './InventoryInspectorRail';
import { useInventoryOpenParam } from './useInventoryOpenParam';
import { useUnitsOverview, type UnitsOverviewRow } from '@/hooks/useUnitsOverview';
import { UnitsGridRow } from './units-grid/UnitsGridRow';
import { UNITS_TABLE_BINDING } from './units-grid/units-table-definition';
import { useUnitsTableLayout } from './units-grid/useUnitsTableLayout';
import {
  defaultDirForUnitsColumn,
  isUnitsColumnSortable,
  unitsSheetColumnsFor,
  unitsSortFactFor,
  type UnitsGridColumn,
  type UnitsGridColumnKey,
} from './units-grid/units-grid-layout';

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Row order for a column sort, keyed by SORT FACT — the structural `product`
 * plus catalog field ids (`unitsSortFactFor` maps a mounted column to one). A
 * `?colsort=` header key resolves through the mounted model, so rebinding a
 * slot re-points the sort with it. String/number/date compares; unknown parks
 * last.
 */
function compareUnitsRows(
  a: UnitsOverviewRow,
  b: UnitsOverviewRow,
  fact: string,
  dir: GridSortDir,
): number {
  const sign = dir === 'asc' ? 1 : -1;
  const s = (v: string | null) => String(v ?? '');
  switch (fact) {
    case 'units.serial':
      return sign * s(a.serial_number).localeCompare(s(b.serial_number));
    case 'product':
      return sign * s(a.product_title).localeCompare(s(b.product_title));
    case 'units.status':
      return sign * s(a.current_status).localeCompare(s(b.current_status));
    case 'units.condition':
      return sign * s(a.condition_grade).localeCompare(s(b.condition_grade));
    case 'units.location':
      return sign * s(a.current_location).localeCompare(s(b.current_location));
    case 'units.updated': {
      if (!a.updated_at && !b.updated_at) return 0;
      if (!a.updated_at) return 1;
      if (!b.updated_at) return -1;
      return sign * a.updated_at.localeCompare(b.updated_at);
    }
    default:
      return 0;
  }
}

export function UnitsWorkspaceView() {
  const searchParams = useSearchParams();

  const q = (searchParams.get('q') ?? '').trim();
  const states = useMemo(() => parseList(searchParams.get('state')), [searchParams]);
  const conditions = useMemo(() => parseList(searchParams.get('condition')), [searchParams]);

  const { rows, loading } = useUnitsOverview({ q, states, conditions });

  // Push inspector selection — `?open=unit:<ref>`, painted optimistically so the
  // rail opens in the click commit (not after the soft-replace).
  const { selection, setOpen } = useInventoryOpenParam();
  const closeInspector = useCallback(() => setOpen(null), [setOpen]);

  // ▦ column-display portal target — the header renders the portal div, the grid
  // portals its column-display trigger into it (Band-3 norm, minimal here).

  const onRowClick = useCallback(
    (row: UnitsOverviewRow) => {
      const ref = row.serial_number ?? String(row.id);
      setOpen(serializeInventoryOpenKey('unit', ref));
    },
    [setOpen],
  );


  const scrollRef = useRef<HTMLDivElement>(null);

  // The COLUMNS are the effective slot layout's materialization (staff ?? org
  // ?? product — wave 1.4 hand-model kill). Sort keys are the mounted track
  // keys; each resolves to its bound field's fact through `unitsSortFactFor`.
  const { effectiveLayout: unitsLayout, fields: unitsFields } = useUnitsTableLayout();
  const columns = useMemo(() => unitsSheetColumnsFor(unitsLayout), [unitsLayout]);
  const sortFactByKey = useMemo(
    () => new Map(columns.map((c) => [c.key as string, unitsSortFactFor(c)])),
    [columns],
  );

  const {
    sort: columnSort,
    dir: sortDir,
    setSort,
  } = useUrlColumnSort<UnitsGridColumnKey>({
    isColumn: (raw) => isUnitsColumnSortable(columns, raw),
    defaultDir: (key) => defaultDirForUnitsColumn(columns, key),
  });

  // One-shot settle re-render after first data — see BinsTable.
  const [, settleTick] = useState(0);
  const hasRows = rows.length > 0;
  useEffect(() => {
    if (loading || !hasRows) return;
    const raf = requestAnimationFrame(() => settleTick((t) => t + 1));
    return () => cancelAnimationFrame(raf);
  }, [loading, hasRows]);

  const { searchQuery, setSearch } = useWorkbenchSearchParam();

  const orderGroupsByDate = useMemo<[string, RowGroup<UnitsOverviewRow>[]][]>(() => {
    const sortFact = columnSort ? (sortFactByKey.get(columnSort) ?? null) : null;
    const ordered =
      sortFact && sortDir
        ? [...rows].sort((a, b) => compareUnitsRows(a, b, sortFact, sortDir))
        : rows;
    return [['', ordered.map((row) => ({ key: `unit:${row.id}`, rows: [row] }))]];
  }, [rows, columnSort, sortFactByKey, sortDir]);

  const onOpen = useCallback((row: UnitsOverviewRow) => onRowClick(row), [onRowClick]);

  const renderLeaf = (row: UnitsOverviewRow, visible: readonly UnitsGridColumn[]) => (
    <UnitsGridRow key={row.id} row={row} onOpen={onOpen} columns={visible} />
  );

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col">
      <DashboardScrollShell className="h-full overflow-y-hidden bg-transparent">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <DataTable<UnitsOverviewRow, UnitsGridColumnKey, UnitsGridColumn>
            binding={UNITS_TABLE_BINDING}
            columns={columns}
            fields={unitsFields}
            orderGroupsByDate={orderGroupsByDate}
            rows={rows}
            getRowId={(r) => String(r.id)}
            sort={columnSort}
            dir={sortDir}
            onSortChange={setSort}
            loading={loading}
            emptyMessage="No units match the current filters."
            searchEmptyMessage="No units match the current filters."
            scrollRef={scrollRef}
search={{ value: searchQuery, onChange: setSearch, placeholder: 'Filter units…' }}
            renderGroup={(group, _stripe, { columns: visible }) => (
              <>{group.rows.map((row) => renderLeaf(row, visible))}</>
            )}
            renderRow={(row, _stripe, { columns: visible }) => renderLeaf(row, visible)}
          />
        </div>
      </DashboardScrollShell>

      {/* Geometry-free — registers the picked record with the app-wide
          RightRailHost slot (returns null). */}
      <InventoryInspectorRail selection={selection} onClose={closeInspector} />
    </div>
  );
}
