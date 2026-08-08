'use client';

/**
 * Local Pickup right pane — the LCPU product spreadsheet. Composes the SoT
 * Workbench chrome ({@link DashboardScrollShell} pinned band +
 * {@link WorkbenchChromeHeader} status tabs + scoped {@link TechRailSearchBar}
 * + {@link WorkbenchTrailingCluster} New Local Pickup CTA) over
 * the pickup-native {@link LedgerGridSurface} adapter (mounted via
 * {@link NonlinearTableHost}), products condensed under their LCPU order number
 * (one-to-many fold).
 *
 * Data is the LCPU pickup dataset (`usePickupLines`), NOT the receiving-lines
 * pipeline — LCPU orders are a distinct entity (draft pickup orders in
 * `local_pickup_orders`), so this reuses the grid *primitives* without inheriting
 * any receiving edit/serial/receive side-effects.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import {
  WORKBENCH_SHEET_CHROME,
  WORKBENCH_SHEET_HOST,
  WorkbenchChromeHeader,
  WorkbenchTrailingCluster,
  WorkbenchTriageBand,
} from '@/components/dashboard/workbench-shell';
import { Button } from '@/design-system/primitives';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { createLocalPickupOrder } from '@/lib/local-pickup/create-order';
import { pickupOrderIsDone } from '@/lib/local-pickup/order-status';
import { cn } from '@/utils/_cn';
import { PickupChromeActions } from './PickupChromeActions';
import {
  parsePickupStatusTab,
  pickupLineMatchesStatus,
  pickupLineNeedsProcess,
  usePickupLines,
  type PickupLine,
  type PickupStatusTab,
} from './pickup-lines';
import { NonlinearTableHost } from '@/components/tables/NonlinearTableHost';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import { groupRowsBy, type RowGroup } from '@/lib/group-rows';
import { PICKUP_TABLE_BINDING } from './grid/pickup-table-definition';
import { PickupGridColumnHeader } from './grid/PickupGridColumnHeader';
import { PickupGridGroupRow } from './grid/PickupGridGroupRow';
import {
  defaultDirForPickupGridSort,
  isPickupGridSortable,
  type PickupGridColumn,
  type PickupGridColumnKey,
} from './grid/pickup-grid-layout';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

/** Group flat pickup lines under their LCPU order (the one-to-many fold key). */
function pickupFoldKey(line: PickupLine): string {
  const po = (line.po_number || '').trim();
  return po || `order:${line.order_id}`;
}

function comparePickupRows(
  a: PickupLine,
  b: PickupLine,
  key: PickupGridColumnKey,
  dir: GridSortDir,
): number {
  const sign = dir === 'asc' ? 1 : -1;
  switch (key) {
    case 'title':
      return sign * a.product_title.localeCompare(b.product_title);
    case 'sku':
      return sign * (a.sku || '').localeCompare(b.sku || '');
    case 'order':
      return sign * (a.po_number || '').localeCompare(b.po_number || '');
    case 'date':
      return sign * (a.pickup_date || '').localeCompare(b.pickup_date || '');
    case 'qty':
      return sign * (a.quantity - b.quantity);
    case 'condition':
      return sign * (a.condition_grade || '').localeCompare(b.condition_grade || '');
    case 'price':
      return sign * ((Number(a.total_price) || 0) - (Number(b.total_price) || 0));
    case 'status':
      return sign * (a.order_status || '').localeCompare(b.order_status || '');
    default:
      return 0;
  }
}

function rowMatchesQuery(line: PickupLine, q: string): boolean {
  if (!q) return true;
  const hay = `${line.product_title} ${line.sku ?? ''} ${line.po_number ?? ''} ${line.customer_name ?? ''} ${line.reference_number ?? ''}`.toLowerCase();
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
  const queryClient = useQueryClient();

  const statusTab = parsePickupStatusTab(searchParams.get('status'));
  const query = searchParams.get('q') ?? '';
  const normalizedQuery = query.trim().toLowerCase();

  const { data: lines, isLoading, isError } = usePickupLines();
  const allRows = useMemo(() => lines ?? [], [lines]);

  const [createOpen, setCreateOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [pickupControlsEl, setPickupControlsEl] = useState<HTMLDivElement | null>(null);

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

  const setParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString());
      mutate(next);
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
    () => allRows.filter((l) => pickupLineMatchesStatus(l, statusTab)),
    [allRows, statusTab],
  );
  const visibleRows = useMemo(
    () => statusRows.filter((l) => rowMatchesQuery(l, normalizedQuery)),
    [statusRows, normalizedQuery],
  );

  const tabs = useMemo(
    () => [
      { id: 'all', label: 'All', count: allRows.length },
      {
        id: 'process',
        label: 'Need to process',
        count: allRows.filter((l) => pickupLineNeedsProcess(l)).length,
      },
      {
        id: 'draft',
        label: 'Draft',
        count: allRows.filter((l) => !pickupOrderIsDone(l.order_status)).length,
      },
      {
        id: 'done',
        label: 'Done',
        count: allRows.filter((l) => pickupOrderIsDone(l.order_status)).length,
      },
    ],
    [allRows],
  );

  const openCreate = useCallback(() => {
    setCustomerName('');
    setCreateError(null);
    setCreateOpen(true);
  }, []);

  const submitCreate = useCallback(async () => {
    const name = customerName.trim();
    if (!name) {
      setCreateError('Customer name is required.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const order = await createLocalPickupOrder({ customerName: name });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['local-pickup-lines'] }),
        queryClient.invalidateQueries({ queryKey: ['local-pickup-orders-rail'] }),
      ]);
      setCreateOpen(false);
      setParams((params) => {
        params.set('lcpu', String(order.id));
        params.set('status', 'draft');
      });
      setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not create pickup.');
    } finally {
      setCreating(false);
    }
  }, [customerName, queryClient, setParams]);

  // Three settled answers, not one string (`display/workbench.md` → the four
  // settled states). Absence invites waiting for the next order; no-match invites
  // clearing the filter; a load failure is neither. The grid picks between the
  // first two itself from `isSearching`, so the branch that stays here is only
  // the failure case.
  const emptyMessage = isError
    ? 'Could not load local pickup orders.'
    : statusTab === 'process'
      ? 'No local pickup orders need processing.'
      : 'No local pickup orders yet.';
  const searchEmptyMessage = 'No local pickup items match this search.';

  // Grid adapter (was `PickupGridView`): the workspace mounts the registry host
  // directly, products condensed under their LCPU order number (one-to-many
  // fold). Column sort is DURABLE on `?colsort=`/`?coldir=`.
  const scrollRef = useRef<HTMLDivElement>(null);
  const {
    sort: columnSort,
    dir: sortDir,
    setSort,
  } = useUrlColumnSort<PickupGridColumnKey>({
    isColumn: isPickupGridSortable,
    defaultDir: defaultDirForPickupGridSort,
  });

  // One-shot "settle" re-render after the grid first has data — the virtualized
  // LedgerGrid mounts its scroll element in the same commit the data arrives,
  // and its re-measure can miss on first paint when nothing else re-renders this
  // subtree, leaving the body blank until the first interaction.
  const [, settleTick] = useState(0);
  const hasRows = visibleRows.length > 0;
  useEffect(() => {
    if (isLoading || !hasRows) return;
    const raf = requestAnimationFrame(() => settleTick((t) => t + 1));
    return () => cancelAnimationFrame(raf);
  }, [isLoading, hasRows]);

  const orderGroupsByDate = useMemo<[string, RowGroup<PickupLine>[]][]>(() => {
    const ordered =
      columnSort && sortDir
        ? [...visibleRows].sort((a, b) => comparePickupRows(a, b, columnSort, sortDir))
        : visibleRows;
    return [['', groupRowsBy(ordered, pickupFoldKey)]];
  }, [visibleRows, columnSort, sortDir]);

  return (
    <>
      <DashboardScrollShell
        chrome={
          <div className={cn(WORKBENCH_SHEET_CHROME, 'flex flex-col gap-0')}>
            <WorkbenchChromeHeader
              density="band"
              className="rounded-none border-l-0 border-t-0 shadow-sm"
              tabs={tabs}
              activeTab={statusTab}
              onTabChange={(id) =>
                setParam('status', (id as PickupStatusTab) === 'all' ? null : id)
              }
              trailing={
                <WorkbenchTrailingCluster
                  actions={<PickupChromeActions onNew={openCreate} busy={creating} />}
                />
              }
            />
            {/* Band 3 — find + ▦ column display. No KPI band (honest absence). */}
            <WorkbenchTriageBand
              controlsSlotRef={setPickupControlsEl}
              search={
                <TechRailSearchBar
                  variant="chrome"
                  value={query}
                  onChange={(v) => setParam('q', v.trim() ? v : null)}
                  placeholder="Filter pickup items…"
                  className="w-40 shrink-0 lg:w-56"
                />
              }
            />
          </div>
        }
      >
        <div className={WORKBENCH_SHEET_HOST}>
          <NonlinearTableHost<PickupLine, PickupGridColumnKey, PickupGridColumn>
            binding={PICKUP_TABLE_BINDING}
            orderGroupsByDate={orderGroupsByDate}
            rows={visibleRows}
            getRowId={(r) => String(r.id)}
            sort={columnSort}
            dir={sortDir}
            onSortChange={setSort}
            loading={isLoading}
            emptyMessage={emptyMessage}
            searchEmptyMessage={searchEmptyMessage}
            isSearching={Boolean(normalizedQuery) && !isError}
            scrollRef={scrollRef}
            columnTriggerPortalTarget={pickupControlsEl}
            renderColumnHeader={({ toggleColumnSort, onResizeColumn, onResetColumn, columns: visible }) => (
              <PickupGridColumnHeader
                columns={visible}
                activeSort={columnSort}
                sortDir={sortDir}
                onSortColumn={toggleColumnSort}
                onResizeColumn={onResizeColumn}
                onResetColumn={onResetColumn}
              />
            )}
            renderGroup={(group, baseStripeIndex, { columns: visible }) => (
              <PickupGridGroupRow
                group={group}
                baseStripeIndex={baseStripeIndex}
                selectedOrderId={selectedOrderId}
                onSelectOrder={onSelectOrder}
                columns={visible}
              />
            )}
            renderRow={(row, stripeIndex, { columns: visible }) => (
              <PickupGridGroupRow
                group={{ key: `k:${row.id}`, rows: [row] }}
                baseStripeIndex={stripeIndex}
                selectedOrderId={selectedOrderId}
                onSelectOrder={onSelectOrder}
                columns={visible}
              />
            )}
          />
        </div>
      </DashboardScrollShell>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (creating) return;
          setCreateOpen(open);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New local pickup</DialogTitle>
            <DialogDescription>
              Creates a DRAFT order. Add items from kiosk intake or Zoho; this
              station processes photos and serials.
            </DialogDescription>
          </DialogHeader>
          <label className="flex flex-col gap-1.5">
            <span className="text-role-caption font-semibold uppercase tracking-widest text-text-soft">
              Customer name
            </span>
            <input
              autoFocus
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void submitCreate();
                }
              }}
              placeholder="Seller / customer"
              className={cn(
                'rounded-md border border-border-subtle bg-surface-card px-3 py-2 text-role-body text-text-primary',
                focusRing('control'),
              )}
            />
          </label>
          {createError ? (
            <p className="text-role-caption text-rose-600">{createError}</p>
          ) : null}
          <DialogFooter>
            <Button
              size="sm"
              variant="ghost"
              disabled={creating}
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={creating}
              onClick={() => void submitCreate()}
            >
              {creating ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
