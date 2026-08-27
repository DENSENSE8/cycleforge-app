'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import UnshippedSidebar from '@/components/unshipped/UnshippedSidebar';
import { useOutboundUrlState } from '@/hooks/useOutboundUrlState';
import { useDashboardSearchController } from '@/hooks/useDashboardSearchController';
import { SHIPPING_ORDERS_PATH } from '@/lib/shipping/orders-desk';
import { appChromeClass } from '@/design-system/tokens/app-surface';

// Route/mode dispatch: exactly ONE body renders per mount, so each station rail
// is its own chunk — same recipe as `SidebarContextPanel`, and the same reason.
// Statically importing all four dragged the Labels · Scan-out · FBA graphs into
// the To-ship desk's rail chunk, which only ever renders `UnshippedSidebar`.
// SSR stays on (default) so the active mode's rail is still server-rendered.
// `UnshippedSidebar` deliberately stays a STATIC import: it is the branch this
// panel paints on `/shipping/orders`, and deferring an on-path body would trade
// bundle size for a network waterfall on the critical path.
const LabelsModeBody = dynamic(
  () => import('@/components/outbound/labels/LabelsModeBody').then((m) => m.LabelsModeBody),
  { loading: () => <div className={`h-full w-full ${appChromeClass}`} /> },
);
const ScanOutModeBody = dynamic(
  () => import('@/components/outbound/scan-out/ScanOutModeBody').then((m) => m.ScanOutModeBody),
  { loading: () => <div className={`h-full w-full ${appChromeClass}`} /> },
);
// FBA keeps the `Suspense` boundary below as its fallback — unchanged face.
const FbaSidebarPanel = dynamic(() =>
  import('@/components/fba/sidebar').then((m) => m.FbaSidebarPanel),
);

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
 * (`OrderIngestRail`, `manual` leaf) — Pattern E rail-less does not mount this panel on
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
