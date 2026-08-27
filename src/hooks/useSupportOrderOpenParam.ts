'use client';

/**
 * Support desk `?openOrderId=` paint-pending — only when `context=support`.
 * Non-Support desk keeps `useDashboardSelectedOrder` (sync-guard).
 *
 * Pending lives in the desk parent so focus swap (board unmounts) still paints.
 */

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOptimisticUrlParam } from '@/hooks/useOptimisticUrlParam';
import {
  ORDERS_DESK_CONTEXT_KEY,
  ORDERS_DESK_SUPPORT_CONTEXT,
  SHIPPING_ORDERS_PATH,
  shippingOrdersHref,
} from '@/lib/shipping/orders-desk';

function parseOpenOrderId(raw: string | null): number | null {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function useSupportOrderOpenParam(enabled: boolean): {
  openOrderId: number | null;
  setOpenOrderId: (next: number | null) => void;
} {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlOpen = useMemo(
    () => (enabled ? parseOpenOrderId(searchParams.get('openOrderId')) : null),
    [enabled, searchParams],
  );

  const replace = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set(ORDERS_DESK_CONTEXT_KEY, ORDERS_DESK_SUPPORT_CONTEXT);
      mutate(params);
      // Drop create-ticket pulse when closing or swapping the open order.
      if (!params.get('openOrderId')) params.delete('createTicket');
      const qs = params.toString();
      router.replace(
        qs ? `${SHIPPING_ORDERS_PATH}?${qs}` : shippingOrdersHref({ context: 'support' }),
        { scroll: false },
      );
    },
    [router, searchParams],
  );

  const write = useCallback((params: URLSearchParams, next: number | null) => {
    if (next != null && next > 0) params.set('openOrderId', String(next));
    else {
      params.delete('openOrderId');
      params.delete('createTicket');
    }
  }, []);

  const { value, setValue } = useOptimisticUrlParam<number | null>({
    urlValue: urlOpen,
    replace,
    write,
    shareKey: enabled ? 'support:openOrderId' : undefined,
  });

  return {
    openOrderId: enabled ? value : null,
    setOpenOrderId: setValue,
  };
}
