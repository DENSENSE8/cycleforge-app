'use client';

/**
 * Legacy `/support?mode=orders` body — redirects to the shared To-ship desk.
 * Proxy also 308s; this covers soft navigations that skip the edge.
 */

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { shippingOrdersHref } from '@/lib/shipping/orders-desk';

export function SupportOrdersWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const openOrderId = Number(searchParams.get('openOrderId')) || null;
    const createTicket =
      searchParams.get('createTicket') === '1' ||
      searchParams.get('createTicket') === 'true';
    router.replace(
      shippingOrdersHref({
        context: 'support',
        openOrderId,
        createTicket,
      }),
    );
  }, [router, searchParams]);

  return <div className="flex h-full w-full bg-surface-canvas" aria-busy />;
}
