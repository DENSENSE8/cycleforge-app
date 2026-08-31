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
 * Outbound sidebar bodies by mode — **mobile only, as of 2026-08-30.**
 *
 * The whole Shipping desk (To ship · Amazon Prep · Labels) is now desk-chrome,
 * and `ContextPanelLayout` collapses the left column outright for any
 * desk-stage surface (`isDeskStageSurface`), so on desktop this panel is not
 * mounted on ANY of those three routes. It still renders in `RouteShell`'s
 * mobile `actions` pane, where it is a full pane the operator switches to —
 * not a column competing with the grid for width.
 *
 * That is what killed the operator's screenshot: `/shipping/labels` reserved
 * 360px and painted {@link LabelsModeBody} (Labels scan band + "Labels
 * printed" recents) beside a stage that had already been measured to give that
 * width back.
 *
 * `/shipping/scan-out` is NOT desk chrome — it is a Scan Station, it keeps this
 * rail on desktop, and {@link ScanOutModeBody} is why this dispatch still
 * exists at all.
 *
 * Add / `?new=true` / `?triage=` intake is owned by {@link OutboundOrdersDesk}
 * (`OrderIngestRail`) — the desk host is the SoT.
 */
export function OutboundSidebarPanel() {
  const pathname = usePathname();
  const { mode } = useOutboundUrlState();
  const dashboardSearch = useDashboardSearchController();

  // Desk To-ship — filter map only, and on MOBILE only (desktop collapses the
  // column). Never LabelsModeBody.
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
        {/*
          Scan out is the only body left. `LabelsModeBody` (scan band + "Labels
          printed" recents) was deleted 2026-08-30 with the Labels route, and
          FBA returns above — so a non-scan-out mode reaching here has no rail
          of its own and renders an empty column rather than another desk's.
        */}
        {mode === 'scan-out' ? <ScanOutModeBody /> : null}
      </div>
    </div>
  );
}
