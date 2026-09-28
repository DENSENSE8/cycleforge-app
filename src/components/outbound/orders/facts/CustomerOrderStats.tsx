'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { focusRing } from '@/design-system/tokens/focus-ring';
import type { CustomerOrderStats as Stats } from '@/lib/customers/customer-order-stats';
import { setDeskSearch } from '@/lib/outbound/desk-search-store';
import { SHIPPING_ORDERS_PATH, shippingOrdersHref } from '@/lib/shipping/orders-desk';
import { formatCurrency } from '@/utils/_number';
import { cn } from '@/utils/_cn';

export const customerOrderStatsKey = (customerId: number) => ['customer-order-stats', customerId] as const;

async function fetchCustomerOrderStats(customerId: number): Promise<Stats> {
  const res = await fetch(`/api/customers/${customerId}/stats`);
  if (!res.ok) throw new Error(`customer stats ${res.status}`);
  return (await res.json()) as Stats;
}

function monthYear(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null;
}

/**
 * One muted line under the buyer's name: "4 orders · $812.40". The count
 * filters the To-ship list to this buyer (desk search = their email, else
 * name) and keeps this record open. A one-order buyer reads "First order".
 * Null with no linked customer, while loading, and on error.
 */
export function CustomerOrderStats({ customerId, currentOrderId }: { customerId: number | null; currentOrderId: number }) {
  const { data } = useQuery({
    queryKey: customerOrderStatsKey(customerId ?? 0),
    queryFn: () => fetchCustomerOrderStats(customerId as number),
    enabled: customerId != null && customerId > 0,
    staleTime: 5 * 60_000,
  });

  if (!customerId || !data || data.orderCount < 1) return null;

  if (data.orderCount === 1) {
    return (
      <span className="text-role-caption text-mode-muted" data-testid="order-record-customer-stats">
        First order
      </span>
    );
  }

  const since = monthYear(data.firstOrderAt);
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-role-caption tabular-nums text-mode-muted" data-testid="order-record-customer-stats">
      <HoverTooltip label={since ? `Show this buyer's orders · since ${since}` : "Show this buyer's orders"} asChild placement="above">
        <Link
          href={shippingOrdersHref({ openOrderId: currentOrderId })}
          onClick={() => setDeskSearch(SHIPPING_ORDERS_PATH, data.search)}
          className={cn('rounded-mode-control underline-offset-2 hover:text-mode-ink hover:underline', focusRing('control'))}
          data-testid="order-record-customer-orders-link"
        >
          {data.orderCount} orders
        </Link>
      </HoverTooltip>
      {data.totalSpent > 0 ? (
        <>
          <span aria-hidden>·</span>
          <span>{formatCurrency(data.totalSpent, data.currency)}</span>
        </>
      ) : null}
    </span>
  );
}
