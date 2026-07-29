'use client';

/**
 * Local Pickup right pane — the LCPU product spreadsheet. Composes the SoT
 * Workbench chrome ({@link DashboardScrollShell} pinned band +
 * {@link WorkbenchChromeHeader} status tabs + scoped {@link ToolbarSearchToggle})
 * over {@link PickupGridView} — the pickup-native {@link LedgerGridSurface}
 * adapter, products condensed under their LCPU order number (one-to-many fold).
 *
 * Data is the LCPU pickup dataset (`usePickupLines`), NOT the receiving-lines
 * pipeline — LCPU orders are a distinct entity (draft pickup orders in
 * `local_pickup_orders`), so this reuses the grid *primitives* without inheriting
 * any receiving edit/serial/receive side-effects.
 */

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import {
  WORKBENCH_BODY_COLUMN,
  WORKBENCH_CHROME_COLUMN,
  WorkbenchChromeHeader,
} from '@/components/dashboard/workbench-shell';
import { ToolbarSearchToggle } from '@/design-system/primitives';
import { GridFieldsMenu } from '@/components/ui/table-column-config/GridFieldsMenu';
import { cn } from '@/utils/_cn';
import { usePickupLines, type PickupLine } from './pickup-lines';
import { PickupGridView } from './grid/PickupGridView';
import { PICKUP_GRID_COLUMNS } from './grid/pickup-grid-layout';

type PickupStatusTab = 'all' | 'draft' | 'done';

function rowMatchesStatus(line: PickupLine, tab: PickupStatusTab): boolean {
  if (tab === 'all') return true;
  const done = line.order_status === 'COMPLETED';
  return tab === 'done' ? done : !done;
}

function rowMatchesQuery(line: PickupLine, q: string): boolean {
  if (!q) return true;
  const hay = `${line.product_title} ${line.sku ?? ''} ${line.po_number ?? ''} ${line.customer_name ?? ''}`.toLowerCase();
  return hay.includes(q);
}

interface PickupWorkspaceProps {
  /** Highlight the rows of this order (sidebar selection, `?lcpu=`). */
  selectedOrderId?: number | null;
}

export function PickupWorkspace({ selectedOrderId = null }: PickupWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const statusTab = (searchParams.get('status') as PickupStatusTab | null) ?? 'all';
  const query = searchParams.get('q') ?? '';
  const normalizedQuery = query.trim().toLowerCase();

  const { data: lines, isLoading, isError } = usePickupLines();
  const allRows = useMemo(() => lines ?? [], [lines]);

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (!value) next.delete(key);
      else next.set(key, value);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const onSelectOrder = useCallback(
    (orderId: number) => {
      setParam('lcpu', selectedOrderId === orderId ? null : String(orderId));
    },
    [setParam, selectedOrderId],
  );

  // Status-scoped rows (drives the visible grid) and the counts for each tab.
  const statusRows = useMemo(
    () => allRows.filter((l) => rowMatchesStatus(l, statusTab)),
    [allRows, statusTab],
  );
  const visibleRows = useMemo(
    () => statusRows.filter((l) => rowMatchesQuery(l, normalizedQuery)),
    [statusRows, normalizedQuery],
  );

  const tabs = useMemo(
    () => [
      { id: 'all', label: 'All', count: allRows.length },
      { id: 'draft', label: 'Draft', count: allRows.filter((l) => l.order_status !== 'COMPLETED').length },
      { id: 'done', label: 'Done', count: allRows.filter((l) => l.order_status === 'COMPLETED').length },
    ],
    [allRows],
  );

  // Three settled answers, not one string (`display/workbench.md` → the four
  // settled states). Absence invites waiting for the next order; no-match invites
  // clearing the filter; a load failure is neither. The grid picks between the
  // first two itself from `isSearching`, so the branch that stays here is only
  // the failure case.
  const emptyMessage = isError
    ? 'Could not load local pickup orders.'
    : 'No local pickup orders yet.';
  const searchEmptyMessage = 'No local pickup items match this search.';

  return (
    <DashboardScrollShell
      chrome={
        <div className={WORKBENCH_CHROME_COLUMN}>
          <WorkbenchChromeHeader
            tabs={tabs}
            activeTab={statusTab}
            onTabChange={(id) => setParam('status', id === 'all' ? null : id)}
            search={
              <ToolbarSearchToggle
                value={query}
                onChange={(v) => setParam('q', v.trim() ? v : null)}
                onClear={() => setParam('q', null)}
                placeholder="Filter pickup items…"
              />
            }
            trailing={
              /* Per-staff column picker — the opt-in path for the `optional`
                 line-detail tracks (sku · qty · cond · price). */
              <GridFieldsMenu tableId="pickup" columns={PICKUP_GRID_COLUMNS} />
            }
          />
        </div>
      }
    >
      <div className={cn(WORKBENCH_BODY_COLUMN, 'flex min-h-0 flex-1 flex-col')}>
        <PickupGridView
          rows={visibleRows}
          loading={isLoading}
          emptyMessage={emptyMessage}
          searchEmptyMessage={searchEmptyMessage}
          isSearching={Boolean(normalizedQuery) && !isError}
          selectedOrderId={selectedOrderId}
          onSelectOrder={onSelectOrder}
        />
      </div>
    </DashboardScrollShell>
  );
}
