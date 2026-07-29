'use client';

/**
 * FBA shipments board — Dashboard FBA tab + `/test` Shipping FBA tab.
 *
 * Composes the `DataTable` SoT (`@/design-system/components/DataTable`): the
 * column schema declares header, alignment, and width once, and the primitive
 * owns the shell, sticky header, cell padding, and typography presets. Replaces
 * the hand-rolled `<table>` that lived in `components/dashboard/` — the exact
 * bespoke sticky-header table DataTable's docstring names as its migration
 * target.
 *
 * Presentation facts resolve through their SoTs, never inline maps: status →
 * `FbaStatusBadge` (over `FBA_STATUS`), due day → `formatDateKeyShort` (a civil
 * key), created instant → `formatDateTimePST`.
 *
 * SCOPE — this is still the **shipment-grain lifecycle board**, not the queue.
 * The agreed destination is an item-grain (FNSKU) queue over `FbaBoardItem`
 * (`/api/fba/shipments/active-with-details`) filtered to open work —
 * OUT_OF_STOCK + PLANNED + TESTED + PACKED, sorted by `FBA_STATUS_ORDER` then
 * due date — matching what `/shipping?mode=fba` already renders and what
 * Amazon's Restock tool does (SKU-level, ship-by dates). That grain swap is
 * deferred; when it lands, this file's column schema is the thing that changes,
 * not the shell.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fbaPaths } from '@/lib/fba/api-paths';
import { Loader2, Minus, Package, Truck } from '@/components/Icons';
import { EmptyState, IconButton } from '@/design-system/primitives';
import { DataTable, type DataTableColumn } from '@/design-system/components/DataTable';
import { formatDateKeyShort, formatDateTimePST } from '@/utils/date';
import { FbaStatusBadge } from '@/components/fba/shared/FbaStatusBadge';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  fbaShipmentsQuery,
  type FBAShipmentLifecycleRow,
} from '@/lib/queries/dashboard-queries';
import { refreshDomain } from '@/lib/refresh/bus';

function ReadinessBar({ ready, total }: { ready: number; total: number }) {
  const pct = total > 0 ? Math.round((ready / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-sunken">
        <div
          className="h-full rounded-full bg-fill-success transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-role-micro tabular-nums text-text-soft">
        {ready}/{total}
      </span>
    </div>
  );
}

/**
 * Qty cell + the escape hatch for a plan staged by mistake: a single-line
 * PLANNED shipment with nothing progressed can drop its only line inline,
 * rather than making the operator open the FBA station to undo one scan.
 */
function QtyCellWithRemove({ row }: { row: FBAShipmentLifecycleRow }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const totalItems = Number(row.total_items) || 0;
  const canRemove =
    row.status === 'PLANNED' && totalItems === 1 && Number(row.ready_items) === 0;

  const removeSinglePlannedItem = async () => {
    if (!canRemove || busy) return;
    setBusy(true);
    try {
      const itemsRes = await fetch(fbaPaths.planItems(row.id), { cache: 'no-store' });
      const data = await itemsRes.json();
      const items = Array.isArray(data?.items) ? data.items : [];
      if (items.length !== 1 || String(items[0].status) !== 'PLANNED') return;
      const del = await fetch(fbaPaths.planItem(row.id, items[0].id), { method: 'DELETE' });
      if (del.ok) {
        await queryClient.invalidateQueries({ queryKey: ['dashboard-fba-shipments'] });
        refreshDomain('orders.outbound');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <span className="font-mono">
        <span
          className={
            Number(row.total_actual_qty) < Number(row.total_expected_qty)
              ? 'text-text-warning'
              : 'text-text-success'
          }
        >
          {row.total_actual_qty}
        </span>
        <span className="text-text-soft">/{row.total_expected_qty}</span>
      </span>
      {canRemove ? (
        <HoverTooltip label="Remove the only line from this plan" asChild>
          <IconButton
            type="button"
            size="xs"
            onClick={() => void removeSinglePlannedItem()}
            disabled={busy}
            ariaLabel="Remove item from plan"
            icon={
              busy ? (
                <Loader2 className="h-3 w-3 animate-spin text-text-faint" />
              ) : (
                <Minus className="h-3 w-3 text-text-danger" />
              )
            }
            className="shrink-0 rounded-md border border-border-danger bg-surface-danger hover:bg-surface-danger/80 disabled:opacity-40"
          />
        </HoverTooltip>
      ) : null}
    </div>
  );
}

const COLUMNS: DataTableColumn<FBAShipmentLifecycleRow>[] = [
  {
    key: 'shipment_ref',
    header: 'Shipment Ref',
    cell: (row) => (
      <>
        <span className="font-mono font-semibold text-text-fulfillment">{row.shipment_ref}</span>
        {row.notes ? (
          <p className="max-w-[140px] truncate text-role-eyebrow font-normal text-text-soft">
            {row.notes}
          </p>
        ) : null}
      </>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    width: '120px',
    cell: (row) => <FbaStatusBadge status={row.status} size="xs" />,
  },
  {
    key: 'ready',
    header: 'Items Ready',
    width: '150px',
    cell: (row) => (
      <ReadinessBar ready={Number(row.ready_items) || 0} total={Number(row.total_items) || 0} />
    ),
  },
  {
    key: 'qty',
    header: 'Qty (Act/Exp)',
    width: '120px',
    cell: (row) => <QtyCellWithRemove row={row} />,
  },
  {
    key: 'fc',
    header: 'FC',
    width: '80px',
    cell: (row) => <span className="font-mono text-text-soft">{row.destination_fc || '—'}</span>,
  },
  {
    key: 'due_date',
    header: 'Due Date',
    width: '110px',
    // Civil key from the route — formatted through the date SoT, never reparsed.
    cell: (row) => (row.due_date ? formatDateKeyShort(row.due_date) : '—'),
  },
  {
    key: 'tech',
    header: 'Tech',
    width: '110px',
    cell: (row) => row.assigned_tech_name || '—',
  },
  {
    key: 'packer',
    header: 'Packer',
    width: '110px',
    cell: (row) => row.assigned_packer_name || '—',
  },
  {
    key: 'created',
    header: 'Created',
    align: 'right',
    width: '170px',
    cell: (row) => <span className="text-text-soft">{formatDateTimePST(row.created_at)}</span>,
  },
];

export default function FbaShipmentsTable() {
  const { data, isLoading, isError } = useQuery({
    ...fbaShipmentsQuery(),
    refetchInterval: 60_000,
  });

  const rows = data?.rows ?? [];

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-canvas">
        <Loader2 className="h-8 w-8 animate-spin text-text-faint" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-dashed border-border-danger bg-surface-danger px-4 py-6 text-center">
        <p className="text-role-caption font-semibold uppercase tracking-widest text-text-danger">
          Failed to load FBA shipments
        </p>
      </div>
    );
  }

  return (
    <DataTable
      columns={COLUMNS}
      rows={rows}
      rowKey={(row) => row.id}
      empty={
        /* Typed first-use empty (onboarding O0): this board has no search/filter,
           so zero rows always means "no shipments yet" — teach the next action
           instead of reading as broken. */
        <EmptyState
          icon={<Truck className="h-6 w-6 text-text-faint" />}
          title="No FBA shipments yet"
          description="Plan your first FBA shipment to track prep, labeling, and hand-off here."
          action={
            <Link
              href="/shipping?mode=fba"
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-accent-bg px-4 text-role-data font-semibold text-text-inverse shadow-sm transition-colors hover:bg-accent-bg/90 active:bg-accent-bg/90"
            >
              <Package className="h-4 w-4" />
              Plan an FBA shipment
            </Link>
          }
        />
      }
    />
  );
}
