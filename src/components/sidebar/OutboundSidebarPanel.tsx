'use client';

/**
 * Outbound sidebar bodies by mode — **mobile only** for desk surfaces, and
 * **never for scan-out** (scan-out is railless: full-bleed center + bottom scan).
 *
 * Shipping desk routes collapse the left column on desktop via
 * `isRaillessSurface`. Scan-out declares `railless: true` too — its scan dock
 * and notes composer live in {@link ScanOutWorkspace}, not here.
 */

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import UnshippedSidebar from '@/components/unshipped/UnshippedSidebar';
import { useOutboundUrlState } from '@/hooks/useOutboundUrlState';
import { useDashboardSearchController } from '@/hooks/useDashboardSearchController';
import { SHIPPING_ORDERS_PATH } from '@/lib/shipping/orders-desk';
import { appChromeClass } from '@/design-system/tokens/app-surface';

const FbaSidebarPanel = dynamic(() =>
  import('@/components/fba/sidebar').then((m) => m.FbaSidebarPanel),
);

function isOrdersDeskPath(pathname: string | null): boolean {
  return (
    pathname === SHIPPING_ORDERS_PATH ||
    Boolean(pathname?.startsWith(`${SHIPPING_ORDERS_PATH}/`))
  );
}

export function OutboundSidebarPanel() {
  const pathname = usePathname();
  const { mode } = useOutboundUrlState();
  const dashboardSearch = useDashboardSearchController();

  // Scan-out is railless — never paint a left body (desktop or mobile actions).
  if (mode === 'scan-out' || pathname === '/shipping/scan-out') {
    return null;
  }

  if (isOrdersDeskPath(pathname)) {
    return (
      <div className={`flex h-full min-h-0 flex-col ${appChromeClass}`}>
        <div className="min-h-0 flex-1">
          <UnshippedSidebar
            embedded
            hideSectionHeader
            searchValue={dashboardSearch.searchQuery}
            onSearchChange={dashboardSearch.setSearch}
          />
        </div>
      </div>
    );
  }

  if (mode === 'fba') {
    return (
      <div className={`flex h-full flex-col overflow-hidden ${appChromeClass}`}>
        <div className="min-h-0 flex-1 overflow-hidden">
          <Suspense fallback={<div className={`h-full w-full ${appChromeClass}`} />}>
            <FbaSidebarPanel />
          </Suspense>
        </div>
      </div>
    );
  }

  return null;
}
