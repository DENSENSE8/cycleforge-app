'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { LabelsModeBody } from '@/components/outbound/labels/LabelsModeBody';
import { ScanOutModeBody } from '@/components/outbound/scan-out/ScanOutModeBody';
import { FbaSidebarPanel } from '@/components/fba/sidebar';
import UnshippedSidebar from '@/components/unshipped/UnshippedSidebar';
import { useOutboundUrlState } from '@/hooks/useOutboundUrlState';
import { useDashboardSearchController } from '@/hooks/useDashboardSearchController';
import { SHIPPING_ORDERS_PATH } from '@/lib/shipping/orders-desk';
import { appChromeClass } from '@/design-system/tokens/app-surface';

function isOrdersDeskPath(pathname: string | null): boolean {
  return (
    pathname === SHIPPING_ORDERS_PATH ||
    Boolean(pathname?.startsWith(`${SHIPPING_ORDERS_PATH}/`))
  );
}

/**
 * Outbound sidebar bodies by mode. L2 Shipping modes live in GlobalHeader
 * (`HeaderPageSwitcher` ← SIDEBAR_PAGE_NAV) — no sidebar mode rail twin.
 * Ready is a stage inside FBA (`?fbaMode=ready`), not a sibling shipping mode.
 *
 * To-ship (`/shipping/orders`) is a desk, not a scan station — it mounts the
 * order-feed filter map ({@link UnshippedSidebar}), never Labels scan band /
 * "Labels printed". Labels · Scan-out · FBA keep their station rails.
 *
 * Add / `?new=true` intake is owned by {@link OutboundOrdersDesk}
 * (`NewOrderEntryOverlay`) — Pattern E rail-less does not mount this panel on
 * desktop, so the desk host is the SoT.
 */
export function OutboundSidebarPanel() {
  const pathname = usePathname();
  const { mode } = useOutboundUrlState();
  const dashboardSearch = useDashboardSearchController();

  // Desk To-ship — filter map only. Not LabelsModeBody.
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

  // FBA owns Ready · Plan · Combine · Shipped rails + scan bar.
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

  return (
    <div className={`flex h-full flex-col overflow-hidden ${appChromeClass}`}>
      <div className="min-h-0 flex-1 overflow-hidden">
        {mode === 'scan-out' ? <ScanOutModeBody /> : <LabelsModeBody />}
      </div>
    </div>
  );
}
