'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import type { DeskPageTab } from '@/design-system/components/DeskPageChrome';

/** The Shipping **desk** frame — Pending · To ship · Shipped · Exceptions. */
export default function ShippingDeskLayout({ children }: { children: ReactNode }) {
  /** The Exceptions tab carries the held-order count, so "22 blocked" is legible from To ship without navigating (a status overview costs ≤1… */
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

  // Every Shipping desk is a fixed-width card stage (owner 2026-09-25): the
  // list takes the 1152px stage and a picked row's record opens in its place;
  // fullscreen — the staffer's choice — is what widens it to the split view.
  return (
    <DeskPageLayout decorateTabs={decorateTabs} stage="card">
      {children}
    </DeskPageLayout>
  );
}
