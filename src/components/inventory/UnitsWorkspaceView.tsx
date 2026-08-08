'use client';

/**
 * Inventory › Units browse workspace — the ops-queue Sheets golden applied to
 * the units collection (Wave 0 of the SoT page-violation migrate). Flush sheet
 * chrome (`WORKBENCH_SHEET_CHROME` Band 1) over `UnitsGridView` in
 * `WORKBENCH_SHEET_HOST`, mounted at `/inventory/units`.
 *
 * Phase A scope (additive, collision-free): Band 1 lifecycle tab + the sheet
 * grid + the ▦ column-display portal. Band 2 (KPI), Band 3 (find + Refine +
 * Show/Hide inspector) and the left `useSavedViews` rail land in Phase B, when
 * the shared `InventoryShell` / `useInventoryUrlState` files (currently dirty in
 * a parallel session) are clean to swap. Row click opens the unit at the record
 * plane through the untouched shell (`/inventory?unit=`) — the push inspector is
 * the Phase B replacement for `InventoryDetailsOverlay`.
 */

import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import {
  WORKBENCH_SHEET_CHROME,
  WORKBENCH_SHEET_HOST,
  WorkbenchChromeHeader,
} from '@/components/dashboard/workbench-shell';
import { UnitsGridView } from './units-grid/UnitsGridView';
import { useUnitsOverview, type UnitsOverviewRow } from '@/hooks/useUnitsOverview';

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function UnitsWorkspaceView() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const q = (searchParams.get('q') ?? '').trim();
  const states = useMemo(() => parseList(searchParams.get('state')), [searchParams]);
  const conditions = useMemo(() => parseList(searchParams.get('condition')), [searchParams]);

  const { rows, loading } = useUnitsOverview({ q, states, conditions });

  // ▦ column-display portal target — the header renders the portal div, the grid
  // portals its column-display trigger into it (Band-3 norm, minimal here).
  const [controlsEl, setControlsEl] = useState<HTMLDivElement | null>(null);

  const onRowClick = useCallback(
    (row: UnitsOverviewRow) => {
      const ref = row.serial_number ?? String(row.id);
      router.push(`/inventory?unit=${encodeURIComponent(ref)}`);
    },
    [router],
  );

  const isSearching = q.length > 0 || states.length > 0 || conditions.length > 0;

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col">
      <DashboardScrollShell
        className="h-full overflow-y-hidden bg-transparent"
        chrome={
          <div className={WORKBENCH_SHEET_CHROME}>
            <WorkbenchChromeHeader
              density="band"
              tabs={[{ id: 'units', label: 'Units' }]}
              activeTab="units"
              onTabChange={() => {}}
              controlsSlotRef={setControlsEl}
            />
          </div>
        }
      >
        <div className={WORKBENCH_SHEET_HOST}>
          <UnitsGridView
            rows={rows}
            loading={loading}
            onRowClick={onRowClick}
            isSearching={isSearching}
            searchEmptyMessage="No units match the current filters."
            columnTriggerPortalTarget={controlsEl}
          />
        </div>
      </DashboardScrollShell>
    </div>
  );
}
