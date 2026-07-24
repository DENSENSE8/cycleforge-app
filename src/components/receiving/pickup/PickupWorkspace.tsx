'use client';

/**
 * Local Pickup right pane — the LCPU product table. Mirrors the Unbox workbench
 * visually (pinned chrome via {@link DashboardScrollShell} + a framed ops table)
 * but its data is the LCPU pickup dataset (`usePickupLines`), not the
 * receiving-lines pipeline (which barely carries LCPU). Row = product, and the
 * Order column carries the LCPU PO# + customer so the flat table reads like the
 * Unbox History table.
 */

import { Loader2, Package } from '@/components/Icons';
import { DataTable, type DataTableColumn } from '@/design-system/components/DataTable';
import { EmptyState } from '@/design-system/primitives';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import {
  WORKBENCH_BODY_COLUMN,
  WORKBENCH_CHROME_COLUMN,
} from '@/components/dashboard/workbench-shell';
import { conditionLabel } from '@/lib/conditions';
import { formatDateKeyShort } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { usePickupLines, pickupMoney, type PickupLine } from './pickup-lines';

const COLUMNS: DataTableColumn<PickupLine>[] = [
  {
    key: 'product',
    // No Zoho photos — product is title-first (icon marker only).
    header: 'Product',
    cell: (l) => (
      <div className="flex min-w-0 items-center gap-2.5">
        <Package className="h-3.5 w-3.5 shrink-0 text-text-faint" aria-hidden />
        <span className="truncate font-bold text-text-default">{l.product_title}</span>
      </div>
    ),
  },
  {
    key: 'sku',
    header: 'SKU',
    width: '130px',
    cell: (l) =>
      l.sku ? (
        <span className="font-mono text-text-soft">{l.sku}</span>
      ) : (
        <span className="text-text-faint">—</span>
      ),
  },
  {
    key: 'order',
    header: 'Order',
    width: '210px',
    cell: (l) => (
      <div className="min-w-0">
        <div className="truncate font-bold text-text-default">{l.po_number || `Order ${l.order_id}`}</div>
        {l.customer_name ? (
          <div className="truncate text-role-eyebrow font-semibold uppercase tracking-widest text-text-faint">
            {l.customer_name}
          </div>
        ) : null}
      </div>
    ),
  },
  {
    key: 'date',
    header: 'Date',
    width: '96px',
    cell: (l) =>
      l.pickup_date ? (
        <span className="tabular-nums text-text-soft">{formatDateKeyShort(l.pickup_date)}</span>
      ) : (
        <span className="text-text-faint">—</span>
      ),
  },
  {
    key: 'qty',
    header: 'Qty',
    align: 'center',
    width: '56px',
    cell: (l) => <span className="font-black tabular-nums">{l.quantity}</span>,
  },
  {
    key: 'condition',
    header: 'Cond',
    width: '92px',
    cell: (l) => (
      <span className="font-bold text-text-soft">{conditionLabel(l.condition_grade, 'compact')}</span>
    ),
  },
  {
    key: 'price',
    header: 'Price',
    align: 'right',
    width: '92px',
    cell: (l) => (
      <span className="font-bold tabular-nums text-emerald-700">{pickupMoney(l.total_price)}</span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    width: '116px',
    cell: (l) => (
      <span
        className={cn(
          'inline-flex items-center rounded px-1.5 py-0.5 text-role-micro font-black uppercase tracking-widest ring-1 ring-inset',
          l.order_status === 'COMPLETED'
            ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
            : 'bg-amber-50 text-amber-700 ring-amber-200',
        )}
      >
        {l.order_status === 'COMPLETED' ? 'Done' : 'Draft'}
      </span>
    ),
  },
];

// PickupLine carries no partsStatus display here; the customer + PO carry identity.

interface PickupWorkspaceProps {
  /** Highlight the rows of this order (sidebar selection). */
  selectedOrderId?: number | null;
}

export function PickupWorkspace({ selectedOrderId }: PickupWorkspaceProps) {
  const { data: lines, isLoading, isError } = usePickupLines();
  const rows = lines ?? [];
  const orderCount = new Set(rows.map((l) => l.order_id)).size;
  const itemCount = rows.reduce((sum, l) => sum + l.quantity, 0);

  return (
    <DashboardScrollShell
      chrome={
        <div className={cn(WORKBENCH_CHROME_COLUMN, 'flex items-center gap-3')}>
          <span className="text-role-eyebrow font-black uppercase tracking-widest text-text-muted">
            Local Pickup
            {orderCount > 0 ? (
              <span className="ml-1 text-text-soft">
                · {orderCount} order{orderCount === 1 ? '' : 's'} · {itemCount} item
                {itemCount === 1 ? '' : 's'}
              </span>
            ) : null}
          </span>
        </div>
      }
    >
      <div className={WORKBENCH_BODY_COLUMN}>
        {isError ? (
          <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-6 text-center text-role-caption font-bold text-rose-700">
            Could not load local pickup orders.
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-role-caption font-bold text-text-soft">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading local pickup…
          </div>
        ) : (
          <DataTable<PickupLine>
            columns={COLUMNS}
            rows={rows}
            rowKey={(l) => l.id}
            isRowSelected={
              selectedOrderId != null ? (l) => l.order_id === selectedOrderId : undefined
            }
            empty={
              <EmptyState
                className="min-h-[16rem]"
                icon={<Package className="h-7 w-7 text-text-faint" />}
                title="No local pickup orders"
                description="LCPU pickup orders and their products appear here."
              />
            }
          />
        )}
      </div>
    </DashboardScrollShell>
  );
}
