'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import type { DeskPageTab } from '@/design-system/components/DeskPageChrome';
import {
  ORDERS_DESK_CONTEXT_KEY,
  ORDERS_DESK_SUPPORT_CONTEXT,
  SHIPPING_ORDERS_PATH,
  parseOrdersDeskContext,
} from '@/lib/shipping/orders-desk';

/**
 * The Shipping **desk** frame — Pending · To ship · Shipped · Exceptions.
 *
 * A route GROUP, so every desk segment shares one {@link DeskPageLayout} mount
 * while `/shipping/scan-out` — a Scan Station — sits outside it and keeps its
 * edge-to-edge station shell. The group adds no URL segment: the routes are
 * still `/shipping/orders|fba|shipped|exceptions`.
 *
 * **`/shipping/fba` is inside this group but is NOT one of those tabs**
 * (2026-09-14). FBA became a row in the Outbound LANE beside Shipping, so the
 * Amazon Prep tab was deleted — two doors to one page is what the `deskChrome`
 * law forbids. It still wears this frame: `useDeskPageChromeTabs` resolves
 * title and tabs from whichever page the path resolves to, so the FBA board
 * gets its own title ("FBA") and **no tab row** — it is not `deskChrome`, and
 * its stages are `?fbaMode=` facets the board draws itself.
 *
 * Everything generic (tabs, title, CTA slot, fullscreen) moved into
 * `DeskPageLayout` on 2026-08-31 when the chrome became the design system's
 * (`@/design-system/components/desk`). What is left here is the ONE thing that
 * is Shipping's alone: the held-order count on the Exceptions tab.
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

  // To ship is the first industrial desk (BRIEF §11): its record ledger runs
  // edge to edge on the mode canvas. Every other tab keeps the card until it
  // adopts the ledger itself. Support › Inquiries aliases this route with the
  // slot table, so it keeps the card too.
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const flush =
    pathname === SHIPPING_ORDERS_PATH &&
    parseOrdersDeskContext(searchParams.get(ORDERS_DESK_CONTEXT_KEY)) !==
      ORDERS_DESK_SUPPORT_CONTEXT;

  return (
    <DeskPageLayout decorateTabs={decorateTabs} stage={flush ? 'flush' : 'card'}>
      {children}
    </DeskPageLayout>
  );
}
