'use client';

import { useLayoutEffect, useState, type RefObject } from 'react';
import {
  ordersQueueViewportForceHidden,
  type OrdersQueueColumnKey,
} from '@/lib/dashboard-order-row-layout';

const EMPTY: ReadonlySet<OrdersQueueColumnKey> = new Set();

/**
 * Ephemeral viewport collapse for the Pending / LedgerGrid spreadsheet.
 * Observes `scrollportRef` width and returns which column keys to drop
 * (By → Qty → Ch.). Does not write staff preferences.
 */
export function useViewportForcedHidden(
  scrollportRef: RefObject<HTMLElement | null>,
): ReadonlySet<OrdersQueueColumnKey> {
  const [forced, setForced] = useState<ReadonlySet<OrdersQueueColumnKey>>(EMPTY);

  useLayoutEffect(() => {
    const el = scrollportRef.current;
    if (!el) return;
    const publish = (width: number) => {
      const next = ordersQueueViewportForceHidden(width);
      setForced((prev) => {
        if (prev.size === next.size && [...next].every((k) => prev.has(k))) return prev;
        return next;
      });
    };
    publish(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (typeof w === 'number') publish(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollportRef]);

  return forced;
}
