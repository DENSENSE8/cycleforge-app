'use client';

/**
 * Picking desk — orders waiting to be picked (BLOCKED / out-of-stock lines,
 * PO paired) on the shared Unshipped table. Tab label "Picking" (operator
 * 2026-09-26; was "Pending").
 */

import { Suspense } from 'react';
import { UnshippedTable } from '@/components/unshipped/UnshippedTable';
import { OrdersViewChromeProvider } from '@/components/outbound/orders/orders-view-chrome-context';
import { useOrderRailSelection } from '@/hooks/useOrderRailSelection';
import { useDashboardRealtime } from '@/hooks/useDashboardRealtime';
import { useDashboardSelectedOrder } from '@/hooks/useDashboardSelectedOrder';

function ShortageDeskContent({
  onPrimaryPainted,
}: {
  onPrimaryPainted?: () => void;
}) {
  const { selectionEnabled, selectionOverlays } = useOrderRailSelection('unshipped');
  useDashboardRealtime();
  // Keeps `?openOrderId=` and the open record in step (deep links, reload,
  // back/forward) — the same owner To ship mounts; the record itself is the
  // ledger's record plane.
  useDashboardSelectedOrder(true);

  return (
    <OrdersViewChromeProvider>
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <UnshippedTable
          strictSearchScope
          railSelection={selectionEnabled}
          ledger
          onPrimaryPainted={onPrimaryPainted}
          searchResultLabel="orders to pick"
          clearSearchLabel="Show all orders to pick"
          fulfillmentLane="pending"
          lockedFulfillmentState="BLOCKED"
        />
        {selectionOverlays}
      </div>
    </OrdersViewChromeProvider>
  );
}

export function ShortageDesk({
  onPrimaryPainted,
}: {
  onPrimaryPainted?: () => void;
} = {}) {
  return (
    <Suspense fallback={null}>
      <ShortageDeskContent onPrimaryPainted={onPrimaryPainted} />
    </Suspense>
  );
}
