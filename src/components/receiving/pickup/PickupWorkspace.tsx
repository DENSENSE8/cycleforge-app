'use client';

/** Local Pickup right pane — the LCPU product spreadsheet. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import { Button } from '@/design-system/primitives';
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
import {
  pickupLineMatchesStatus,
  pickupLineNeedsProcess,
  pickupOrderIsDone,
} from '@/lib/local-pickup/order-status';
import { cn } from '@/utils/_cn';
import {
  parsePickupStatusTab,
  usePickupLines,
  type PickupLine,
  type PickupStatusTab,
} from './pickup-lines';
import { DataTable } from '@/components/tables/DataTable';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import { groupRowsBy, type RowGroup } from '@/lib/group-rows';
import { PICKUP_TABLE_BINDING } from './grid/pickup-table-definition';
import { PickupGridGroupRow } from './grid/PickupGridGroupRow';
import {
  defaultDirForPickupColumn,
  isPickupColumnSortable,
  pickupSheetColumnsFor,
  pickupSortFactFor,
  type PickupGridColumn,
  type PickupGridColumnKey,
} from './grid/pickup-grid-layout';
import { usePickupTableLayout } from './grid/usePickupTableLayout';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

/** Group flat pickup lines under their LCPU order (the one-to-many fold key). */
function pickupFoldKey(line: PickupLine): string {
  const po = (line.po_number || '').trim();
  return po || `order:${line.order_id}`;
}

/** Row comparator keyed by SORT FACT — the structural facts (`title`/`order`) plus catalog field ids (`pickupSortFactFor` maps a mounted… */
function comparePickupRows(
  a: PickupLine,
  b: PickupLine,
  fact: string,
  dir: GridSortDir,
): number {
  const sign = dir === 'asc' ? 1 : -1;
  switch (fact) {
    case 'title':
      return sign * a.product_title.localeCompare(b.product_title);
    case 'pickup.sku':
      return sign * (a.sku || '').localeCompare(b.sku || '');
    case 'order':
      return sign * (a.po_number || '').localeCompare(b.po_number || '');
    case 'pickup.date':
      return sign * (a.pickup_date || '').localeCompare(b.pickup_date || '');
    case 'pickup.qty':
      return sign * (a.quantity - b.quantity);
    case 'pickup.condition':
      return sign * (a.condition_grade || '').localeCompare(b.condition_grade || '');
    case 'pickup.price':
      return sign * ((Number(a.total_price) || 0) - (Number(b.total_price) || 0));
    case 'pickup.status':
      return sign * (a.order_status || '').localeCompare(b.order_status || '');
    case 'pickup.customer':
      return sign * (a.customer_name || '').localeCompare(b.customer_name || '');
    default:
      return 0;
  }
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

  // The find text rides the FETCH KEY, not a client pass.
  const { data: lines, isLoading, isError, isFetching } = usePickupLines(query);
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
  // Status is the only CLIENT narrowing left: it is a filter over the answer,
  // not a second search.
  const statusRows = useMemo(
    () => allRows.filter((l) => pickupLineMatchesStatus(l, statusTab)),
    [allRows, statusTab],
  );

  // Status lives in the ONE filter control (operator ruling 2026-08-30 — selection tabs are filters; the bottom strip carries counts only).
  const statusFilter = useMemo(
    () => ({
      options: [
        {
          id: 'process',
          label: 'Need to process',
          count: allRows.filter((l) => pickupLineNeedsProcess(l)).length || undefined,
          active: statusTab === 'process',
        },
        {
          id: 'draft',
          label: 'Draft',
          count: allRows.filter((l) => !pickupOrderIsDone(l.order_status)).length || undefined,
          active: statusTab === 'draft',
        },
        {
          id: 'done',
          label: 'Done',
          count: allRows.filter((l) => pickupOrderIsDone(l.order_status)).length || undefined,
          active: statusTab === 'done',
        },
      ],
      onToggle: (id: string) =>
        setParam('status', id === statusTab ? null : (id as PickupStatusTab)),
      onClearAll: () => setParam('status', null),
    }),
    [allRows, statusTab, setParam],
  );

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

  // Three settled answers, not one string (`display/workbench.md` → the four settled states).
  const emptyMessage = isError
    ? 'Could not load local pickup orders.'
    : statusTab === 'process'
      ? 'No local pickup orders need processing.'
      : 'No local pickup orders yet.';
  const searchEmptyMessage = 'No local pickup items match this search.';

  // Grid adapter (was `PickupGridView`):
  const { effectiveLayout, fields } = usePickupTableLayout();
  const columns = useMemo(() => pickupSheetColumnsFor(effectiveLayout), [effectiveLayout]);
  const sortFactByKey = useMemo(
    () => new Map(columns.map((c) => [c.key as string, pickupSortFactFor(c)])),
    [columns],
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const {
    sort: columnSort,
    dir: sortDir,
    setSort,
  } = useUrlColumnSort<PickupGridColumnKey>({
    isColumn: (raw) => isPickupColumnSortable(columns, raw),
    defaultDir: (key) => defaultDirForPickupColumn(columns, key),
  });

  // One-shot "settle" re-render after the grid first has data — the virtualized LedgerGrid mounts its scroll element in the same commit the…
  const [, settleTick] = useState(0);
  const hasRows = statusRows.length > 0;
  useEffect(() => {
    if (isLoading || !hasRows) return;
    const raf = requestAnimationFrame(() => settleTick((t) => t + 1));
    return () => cancelAnimationFrame(raf);
  }, [isLoading, hasRows]);

  const orderGroupsByDate = useMemo<[string, RowGroup<PickupLine>[]][]>(() => {
    const sortFact = columnSort ? (sortFactByKey.get(columnSort) ?? null) : null;
    const ordered =
      sortFact && sortDir
        ? [...statusRows].sort((a, b) => comparePickupRows(a, b, sortFact, sortDir))
        : statusRows;
    return [['', groupRowsBy(ordered, pickupFoldKey)]];
  }, [statusRows, columnSort, sortFactByKey, sortDir]);

  return (
    <>
      <DashboardScrollShell>
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <DataTable<PickupLine, PickupGridColumnKey, PickupGridColumn>
            binding={PICKUP_TABLE_BINDING}
            columns={columns}
            fields={fields}
            orderGroupsByDate={orderGroupsByDate}
            rows={statusRows}
            getRowId={(r) => String(r.id)}
            sort={columnSort}
            dir={sortDir}
            onSortChange={setSort}
            loading={isLoading}
            emptyMessage={emptyMessage}
            searchEmptyMessage={searchEmptyMessage}
            search={{
              value: query,
              onChange: (v) => setParam('q', v.trim() ? v : null),
              placeholder: 'Filter pickup items…',
              answeredBy: 'server',
              pending: isFetching,
            }}
            filter={statusFilter}
            totalCount={allRows.length}
            scrollRef={scrollRef}
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
