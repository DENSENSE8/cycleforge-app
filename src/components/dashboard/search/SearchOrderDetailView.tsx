'use client';

/**
 * Dashboard Search · selected-order detail host.
 *
 * Resolves `openOrderId` (numeric pk or human order # / tracking token) to a
 * ShippedOrder, then mounts the remade two-column search detail shell.
 * Never imports ShippedDetailsPanel / Header / Body.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, Loader2, Package } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import type { ShippedOrder } from '@/types/orders';
import { fetchDashboardOrderRowById } from '@/lib/dashboard-table-data';
import { isFbaOrder } from '@/utils/order-platform';
import { orderSearchHref } from '@/lib/search/search-hit';
import { SearchOrderDetailShell } from '@/components/dashboard/search/SearchOrderDetailShell';

type Resolved =
  | { status: 'ok'; order: ShippedOrder }
  | { status: 'fba' }
  | { status: 'notfound' };

async function resolveOrder(orderId: string): Promise<Resolved> {
  const raw = decodeURIComponent(orderId || '').trim();
  if (!raw) return { status: 'notfound' };

  if (/^\d+$/.test(raw)) {
    const order = await fetchDashboardOrderRowById(Number(raw));
    if (order) return { status: 'ok', order };
    try {
      const res = await fetch(`/api/orders/${raw}`, { credentials: 'include', cache: 'no-store' });
      if (res.ok) {
        const o = (await res.json())?.order;
        if (o && isFbaOrder(o.order_id, o.account_source)) return { status: 'fba' };
      }
    } catch {
      /* fall through */
    }
    return { status: 'notfound' };
  }

  try {
    const res = await fetch(`/api/orders/lookup/${encodeURIComponent(raw)}`, {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok) return { status: 'notfound' };
    const o = (await res.json())?.order;
    if (!o) return { status: 'notfound' };
    if (isFbaOrder(o.order_id, o.account_source)) return { status: 'fba' };
    if (typeof o.id === 'number') {
      const order = await fetchDashboardOrderRowById(o.id);
      if (order) return { status: 'ok', order };
    }
    return { status: 'notfound' };
  } catch {
    return { status: 'notfound' };
  }
}

function EmptyStateShell({
  title,
  body,
  action,
}: {
  title: string;
  body: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-surface-canvas">
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-sm rounded-xl border border-dashed border-border-soft bg-surface-canvas px-6 py-10 text-center">
          <Package className="mx-auto mb-3 h-8 w-8 text-text-faint" />
          <p className="text-role-caption font-semibold text-text-default">{title}</p>
          <p className="mt-1 text-role-caption text-text-muted">{body}</p>
          {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function SearchOrderDetailView({
  openOrderId,
  query,
}: {
  openOrderId: string;
  query?: string;
}) {
  const router = useRouter();
  const [resolved, setResolved] = useState<Resolved | null>(null);

  const load = useCallback(async () => {
    setResolved(null);
    const next = await resolveOrder(openOrderId);
    // Canonicalize human order # / tracking path → numeric openOrderId.
    if (next.status === 'ok' && String(next.order.id) !== openOrderId && /^\d+$/.test(String(next.order.id))) {
      router.replace(orderSearchHref(next.order.id, query));
      return;
    }
    setResolved(next);
  }, [openOrderId, query, router]);

  useEffect(() => {
    void load();
  }, [load]);

  if (resolved === null) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-surface-canvas">
        <span className="flex items-center gap-2 text-role-caption font-semibold text-text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading order…
        </span>
      </div>
    );
  }

  if (resolved.status === 'fba') {
    return (
      <EmptyStateShell
        title="This is an Amazon FBA shipment"
        body="FBA shipments are managed in the FBA workspace, not Search order detail."
        action={
          <Button
            variant="primary"
            size="md"
            icon={<ExternalLink className="h-3.5 w-3.5" />}
            onClick={() => router.push('/fba')}
          >
            Open FBA workspace
          </Button>
        }
      />
    );
  }

  if (resolved.status === 'notfound') {
    return (
      <EmptyStateShell
        title="Order not found"
        body={
          <>
            Couldn&apos;t load <span className="font-mono">{openOrderId}</span>.
          </>
        }
      />
    );
  }

  return <SearchOrderDetailShell order={resolved.order} initialSection="timeline" />;
}
