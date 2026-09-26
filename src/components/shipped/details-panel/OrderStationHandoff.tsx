'use client';

import Link from 'next/link';
import { ChevronRight } from '@/components/Icons';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import type { OrderInspectorRecordCta } from '@/lib/selection-context/order-inspector-context';
import { testingHandoffHref } from '@/lib/selection-context/station-handoff';

interface OrderStationHandoffProps {
  order: ShippedOrder;
  /** Resolved from the inspector context — an empty list renders nothing. */
  ctas: readonly OrderInspectorRecordCta[];
  /** Desk flush — no outer mx-8. */
  flush?: boolean;
}

/** Record-plane station hand-off — one quiet deep-link to the surface that owns the NEXT piece of work on this order. */
export function OrderStationHandoff({ order, ctas, flush = false }: OrderStationHandoffProps) {
  if (!ctas.includes('open_testing')) return null;

  const href = testingHandoffHref(order.order_id);
  if (!href) return null;

  return (
    <div className={flush ? 'flex items-center justify-end' : 'mx-8 flex items-center justify-end'}>
      <Link
        href={href}
        data-testid="order-handoff-testing"
        className="inline-flex items-center gap-1.5 rounded-none px-2 py-1 text-role-caption font-semibold text-text-muted hover:bg-surface-hover hover:text-blue-600"
      >
        Open in Testing
        <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
