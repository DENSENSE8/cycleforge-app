'use client';

/**
 * Local Pickup right pane — the LCPU product spreadsheet. Composes the SoT
 * Workbench chrome ({@link DashboardScrollShell} pinned band +
 * {@link WorkbenchChromeHeader} status tabs + scoped {@link TechRailSearchBar}
 * + {@link WorkbenchTrailingCluster} New Local Pickup CTA) over
 * {@link PickupGridView} — the pickup-native {@link LedgerGridSurface}
 * adapter, products condensed under their LCPU order number (one-to-many fold).
 *
 * Data is the LCPU pickup dataset (`usePickupLines`), NOT the receiving-lines
 * pipeline — LCPU orders are a distinct entity (draft pickup orders in
 * `local_pickup_orders`), so this reuses the grid *primitives* without inheriting
 * any receiving edit/serial/receive side-effects.
 */

import { useCallback, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import {
  WORKBENCH_BODY_COLUMN,
  WORKBENCH_CHROME_COLUMN,
  WorkbenchChromeHeader,
  WorkbenchTrailingCluster,
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
import { PickupGridView } from './grid/PickupGridView';

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

  return (
    <>
      <DashboardScrollShell
        chrome={
          <div className={WORKBENCH_CHROME_COLUMN}>
            <WorkbenchChromeHeader
              density="band"
              tabs={tabs}
              activeTab={statusTab}
              onTabChange={(id) =>
                setParam('status', (id as PickupStatusTab) === 'all' ? null : id)
              }
              search={
                <TechRailSearchBar
                  variant="chrome"
                  value={query}
                  onChange={(v) => setParam('q', v.trim() ? v : null)}
                  placeholder="Filter pickup items…"
                  className="w-40 shrink-0 lg:w-56"
                />
              }
              trailing={
                <WorkbenchTrailingCluster
                  actions={<PickupChromeActions onNew={openCreate} busy={creating} />}
                />
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
