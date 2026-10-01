'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from '@/components/Icons';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { RECORD_ID_CLASS } from '@/design-system/tokens/record';
import { shippingOrdersHref } from '@/lib/shipping/orders-desk';
import {
  duplicateLeadCopy,
  groupDuplicateOrders,
  type PossibleDuplicateMatch,
} from '@/lib/orders/possible-duplicates';
import { cn } from '@/utils/_cn';

/** Other orders shown before the rest fold behind "n more". */
const SHOWN = 2;

type DuplicatesResponse = { ok: boolean; orderDate: string | null; matches: PossibleDuplicateMatch[] };

export const orderPossibleDuplicatesKey = (orderId: number) => ['order-possible-duplicates', orderId] as const;

async function fetchPossibleDuplicates(orderId: number): Promise<DuplicatesResponse> {
  const res = await fetch(`/api/orders/${orderId}/possible-duplicates?days=30`);
  if (!res.ok) throw new Error(`possible-duplicates ${res.status}`);
  return (await res.json()) as DuplicatesResponse;
}

/**
 * Warn when the same buyer ordered the same SKU on another order within 30
 * days — the double-charge / double-ship catch. Each other order number opens
 * that record. Null while loading, on error, and when there is no match.
 */
export function DuplicateOrderBanner({ orderId }: { orderId: number }) {
  const [expanded, setExpanded] = useState(false);
  const { data } = useQuery({
    queryKey: orderPossibleDuplicatesKey(orderId),
    queryFn: () => fetchPossibleDuplicates(orderId),
    enabled: Number.isFinite(orderId) && orderId > 0,
    staleTime: 60_000,
  });

  const others = data?.ok ? groupDuplicateOrders(data.matches, data.orderDate) : [];
  if (others.length === 0) return null;

  const shown = expanded ? others : others.slice(0, SHOWN);
  const hidden = others.length - shown.length;

  return (
    <Alert variant="warning" data-testid="order-record-duplicate-banner">
      <AlertTriangle aria-hidden />
      <AlertTitle>{duplicateLeadCopy(others[0].days)}</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {shown.map((other) => (
          <Link
            key={other.orderRowId}
            href={shippingOrdersHref({ openOrderId: other.orderRowId })}
            className={cn(RECORD_ID_CLASS, 'rounded-mode-control underline underline-offset-2', focusRing('control'))}
            data-testid="order-record-duplicate-link"
          >
            #{other.orderNumber || other.orderRowId}
          </Link>
        ))}
        {hidden > 0 ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(true)} aria-expanded={false}>
            {hidden} more ▾
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
