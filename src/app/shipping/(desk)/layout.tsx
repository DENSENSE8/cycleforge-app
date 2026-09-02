'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import type { DeskPageTab } from '@/design-system/components/DeskPageChrome';

/**
 * The Shipping **desk** frame — To ship · Shortage · Amazon Prep · Shipped ·
 * Exceptions.
 *
 * A route GROUP, so every desk segment shares one {@link DeskPageLayout} mount
 * while `/shipping/scan-out` — a Scan Station — sits outside it and keeps its
 * edge-to-edge station shell (`bleed`). The group adds no URL segment: the
 * routes are still `/shipping/orders|shortage|fba|shipped|exceptions`.
 *
 * Everything generic (tabs, title, CTA slot, fullscreen) lives in
 * `DeskPageLayout`. What is left here is Shipping's own: the held-order count
 * on the Exceptions tab.
 */
export default function ShippingDeskLayout({ children }: { children: ReactNode }) {
  /**
   * The Exceptions tab carries the held-order count, so "22 blocked" is legible
   * from To ship without navigating (a status overview costs ≤1 interaction).
   * Decorated HERE rather than in `useDeskPageChromeTabs` because that adapter
   * is shared by every desk and must not learn one desk's query.
   *
   * A PLAIN FETCH, deliberately — not `useQuery`. This layout renders ABOVE the
   * app's `QueryClientProvider`, so a react-query hook here throws "No
   * QueryClient set" and takes down all the desk tabs with it. One uncached
   * count on desk mount is the cheaper trade than hoisting a provider.
   *
   * A failed or absent count omits the badge — never a zero, which would assert
   * "nothing is blocked" on no evidence.
   */
  const [cagedCount, setCagedCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/orders/caged?countOnly=1', {
          credentials: 'same-origin',
        });
        if (!res.ok) return;
        const data = (await res.json()) as { count?: number };
        if (!cancelled && typeof data.count === 'number') setCagedCount(data.count);
      } catch {
        /* badge simply does not appear */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const decorateTabs = useCallback(
    (tabs: readonly DeskPageTab[]) =>
      cagedCount != null && cagedCount > 0
        ? tabs.map((tab) => (tab.id === 'exceptions' ? { ...tab, count: cagedCount } : tab))
        : tabs,
    [cagedCount],
  );

  return <DeskPageLayout decorateTabs={decorateTabs}>{children}</DeskPageLayout>;
}
