'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DeskPageChrome } from '@/components/desk/DeskPageChrome';
import {
  DeskActionSlotProvider,
  useDeskActionSlotNode,
} from '@/components/desk/DeskActionSlot';
import { useDeskPageChromeTabs } from '@/components/desk/useDeskPageChromeTabs';
import { cagedOrdersCountQuery } from '@/lib/queries/caged-orders-queries';

/**
 * The Shipping **desk** frame — To ship · Amazon Prep · Labels.
 *
 * A route GROUP, so the three desk segments share one {@link DeskPageChrome}
 * mount (tab band + fixed-width stage) while `/shipping/scan-out` — a Scan
 * Station — sits outside it and keeps its edge-to-edge station shell. The group
 * adds no URL segment: the routes are still `/shipping/orders|fba|labels`.
 *
 * Sharing the mount is also what lets fullscreen survive a tab switch: Next
 * keeps a layout mounted across sibling segments, so Orders → Amazon Prep swaps
 * only the body. Fullscreen is deliberately session state and not a URL param —
 * it is how this operator wants THIS screen right now, not part of the address
 * of what they are looking at, and a stage that reopened wide from a pasted
 * link would be a link that changed the page.
 *
 * Which tabs to draw is data (`deskChrome: true` on the `outbound` page in
 * `SIDEBAR_PAGE_NAV`) — the chrome never branches on the route.
 *
 * The header's CTA slot is data too: this layout provides the
 * {@link DeskActionSlotProvider} channel and renders whatever the ACTIVE desk
 * registered into it. To ship registers its **Add order**; Amazon Prep and
 * Labels register nothing and the slot stays empty. The frame never imports one
 * desk's intake — that is the difference between a shared frame and a host.
 *
 * The page TITLE is data by the same rule, and from the same place: the hook
 * hands back the nav entry's own label, so the header cannot drift from the
 * spine row and the chrome never looks anything up for itself.
 */
export default function ShippingDeskLayout({ children }: { children: ReactNode }) {
  return (
    <DeskActionSlotProvider>
      <ShippingDeskFrame>{children}</ShippingDeskFrame>
    </DeskActionSlotProvider>
  );
}

/** Inner half — reads the slot the provider above it owns. */
function ShippingDeskFrame({ children }: { children: ReactNode }) {
  const { title, tabs, activeTab, onTabChange } = useDeskPageChromeTabs();
  const [fullscreen, setFullscreen] = useState(false);
  const toggleFullscreen = useCallback(() => setFullscreen((v) => !v), []);
  const addSlot = useDeskActionSlotNode();

  /**
   * The Exceptions tab carries the held-order count, so "22 blocked" is legible
   * from To ship without navigating (AGENTS.md: a status overview costs ≤1
   * interaction). Decorated HERE rather than in `useDeskPageChromeTabs` because
   * that adapter is shared by every desk and must not learn one desk's query.
   * A failed/absent count simply omits the badge — never a zero, which would
   * assert "nothing is blocked" on no evidence.
   */
  const cagedCount = useQuery({ ...cagedOrdersCountQuery(), retry: false });
  const tabsWithCounts = useMemo(
    () =>
      tabs.map((tab) =>
        tab.id === 'exceptions' && typeof cagedCount.data === 'number' && cagedCount.data > 0
          ? { ...tab, count: cagedCount.data }
          : tab,
      ),
    [tabs, cagedCount.data],
  );

  return (
    <DeskPageChrome
      title={title}
      tabs={tabsWithCounts}
      activeTab={activeTab}
      onTabChange={onTabChange}
      addSlot={addSlot}
      fullscreen={fullscreen}
      onToggleFullscreen={toggleFullscreen}
    >
      {children}
    </DeskPageChrome>
  );
}
