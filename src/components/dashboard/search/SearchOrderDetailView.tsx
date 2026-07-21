'use client';

/**
 * Dashboard Search · selected-order detail host.
 *
 * Resolves `openOrderId` (numeric pk or human order # / tracking token) to a
 * ShippedOrder, then mounts the remade two-column search detail shell.
 * Never imports ShippedDetailsPanel / Header / Body.
 *
 * Canonicalize (human # → numeric id) paints once and keeps the shell across
 * the URL replace — no Loading↔empty flash.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, Loader2, Package } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { orderSearchHref } from '@/lib/search/search-hit';
import {
  resolveSearchOrder,
  type ResolvedSearchOrder,
} from '@/lib/search/resolve-search-order';
import { SearchOrderDetailShell } from '@/components/dashboard/search/SearchOrderDetailShell';

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
  const [resolved, setResolved] = useState<ResolvedSearchOrder | null>(null);
  /** Already-painted order — skip blank/reload across human→numeric canonicalize. */
  const paintedRef = useRef<{ id: number; orderId: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const painted = paintedRef.current;
      if (painted) {
        const human = painted.orderId;
        if (openOrderId === String(painted.id) || (human && openOrderId === human)) {
          if (openOrderId !== String(painted.id)) {
            router.replace(orderSearchHref(painted.id, query));
          }
          return;
        }
      }

      setResolved(null);
      const next = await resolveSearchOrder(openOrderId);
      if (cancelled) return;

      if (next.status === 'ok') {
        paintedRef.current = {
          id: next.order.id,
          orderId: String(next.order.order_id || '').trim(),
        };
        setResolved(next);
        if (String(next.order.id) !== openOrderId) {
          router.replace(orderSearchHref(next.order.id, query));
        }
        return;
      }

      paintedRef.current = null;
      // Human # / tracking / Zoho PO false opens: fall through to cross-entity
      // results. Numeric pk (from a search hit) stays on the empty shell —
      // redirecting clears openOrderId and the sidebar re-auto-opens → flash loop.
      if (next.status === 'notfound') {
        const q = query?.trim();
        const isNumericPk = /^\d+$/.test(openOrderId.trim());
        if (q && !isNumericPk) {
          router.replace(`/dashboard?mode=search&q=${encodeURIComponent(q)}&map=search`);
          return;
        }
      }
      setResolved(next);
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [openOrderId, query, router]);

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
