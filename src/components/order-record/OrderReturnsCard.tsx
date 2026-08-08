'use client';

/**
 * Returns / RMA rail card (Week 2).
 *
 * `rma_authorizations.order_id` has been FK'd to `orders(id)` since 2026-05-23
 * and was read by nothing — a return could be authorized against an order and
 * leave no trace on the order's own record. The timeline now carries the RMA
 * events; this card is the at-a-glance rail answer to "does this order have a
 * return open?".
 *
 * Shares the `['order-timeline', orderId]` query key with `OrderTimelineSection`,
 * so mounting both costs one request — TanStack dedupes, and the RMA spine is
 * already in that payload.
 */

import { useQuery } from '@tanstack/react-query';
import type { RmaTimelineRow } from '@/lib/timeline';
import { OrderRecordCard } from '@/components/order-record/order-record-card';
import { formatDateTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';

const OPEN_STATUSES = new Set(['AUTHORIZED', 'RECEIVED', 'DISPOSITIONED']);

function directionLabel(direction: string | null | undefined): string {
  switch ((direction || '').toUpperCase()) {
    case 'INBOUND_FROM_CUSTOMER':
      return 'Customer return';
    case 'OUTBOUND_TO_VENDOR':
      return 'Vendor return';
    default:
      return 'Return';
  }
}

export function OrderReturnsCard({
  orderId,
  chrome = 'panel',
}: {
  orderId: number;
  /**
   * `panel` (default) — soft `OrderRecordCard` for desk rails.
   * `flush` — search-feedback sibling of `FlushSection` (eyebrow + dense body).
   */
  chrome?: 'panel' | 'flush';
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['order-timeline', orderId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}/timeline`);
      if (!res.ok) throw new Error('Failed to fetch order timeline');
      return res.json();
    },
    enabled: Number.isFinite(orderId) && orderId > 0,
    staleTime: 30_000,
  });

  const rmas = (data?.rmaEvents ?? []) as RmaTimelineRow[];

  // Presence-driven: an order with no return history shows no card at all,
  // rather than a permanent empty "no returns" panel on every record.
  if (isLoading || rmas.length === 0) return null;

  const list = (
    <ul className="divide-y divide-border-hairline">
      {rmas.map((r) => {
        const open = OPEN_STATUSES.has((r.status || '').toUpperCase());
        return (
          <li key={r.id} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <p className="truncate text-role-caption font-semibold text-text-default">
                {directionLabel(r.direction)}
              </p>
              <p className="truncate font-mono text-role-micro text-text-muted">{r.rma_number}</p>
              {r.authorized_at ? (
                <p className="text-role-micro font-medium text-text-faint">
                  {formatDateTimePST(r.authorized_at)}
                </p>
              ) : null}
            </div>
            <span
              className={cn(
                'shrink-0 rounded-none px-1.5 py-0.5 text-role-eyebrow font-semibold uppercase tracking-widest ring-1 ring-inset',
                open
                  ? 'bg-amber-50 text-text-warning ring-amber-200'
                  : 'bg-surface-sunken text-text-muted ring-border-soft',
              )}
            >
              {(r.status || 'unknown').replace(/[_-]+/g, ' ').toLowerCase()}
            </span>
          </li>
        );
      })}
    </ul>
  );

  if (chrome === 'flush') {
    return (
      <section className="bg-surface-card" data-testid="order-returns-flush">
        <header className="border-b border-border-hairline px-3 py-1.5">
          <h3 className="text-role-eyebrow font-semibold uppercase tracking-widest text-text-faint">
            Returns
          </h3>
        </header>
        <div className="px-3 py-2">{list}</div>
      </section>
    );
  }

  return <OrderRecordCard title="Returns">{list}</OrderRecordCard>;
}
