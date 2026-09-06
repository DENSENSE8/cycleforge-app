'use client';

import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useAuth } from '@/contexts/AuthContext';
import { getSidebarRouteKey } from '@/lib/sidebar-navigation';
import { getSidebarTitle } from '@/lib/sidebar-titles';

// Every panel is code-split on the route key. Static imports here would drag
// every feature area's sidebar graph (orders, FBA, studio, support, …) into
// the shared shell bundle on every page — this dispatcher is exactly where the
// per-route chunk boundary belongs. SSR stays on (default), so the active
// route's panel is still server-rendered into the first HTML; the client only
// downloads the one chunk its route needs.
const DashboardOrdersContextPanel = dynamic(() => import('@/components/sidebar/DashboardOrdersContextPanel').then((m) => m.DashboardOrdersContextPanel));
const OperationsSidebarPanel = dynamic(() => import('@/components/sidebar/OperationsSidebarPanel').then((m) => m.OperationsSidebarPanel));
const StudioSidebarPanel = dynamic(() => import('@/components/sidebar/StudioSidebarPanel').then((m) => m.StudioSidebarPanel));
const SupportSidebarPanel = dynamic(() => import('@/components/sidebar/SupportSidebarPanel').then((m) => m.SupportSidebarPanel));
const AiChatSidebarPanel = dynamic(() => import('@/components/sidebar/AiChatSidebarPanel').then((m) => m.AiChatSidebarPanel));
const AuditLogSidebarPanel = dynamic(() => import('@/components/sidebar/AuditLogSidebarPanel').then((m) => m.AuditLogSidebarPanel));
const ReceivingSidebarPanel = dynamic(() => import('@/components/sidebar/ReceivingSidebarPanel').then((m) => m.ReceivingSidebarPanel));
const FbaSidebarPanel = dynamic(() => import('@/components/fba/sidebar').then((m) => m.FbaSidebarPanel));
const SourcingSidebarPanel = dynamic(() => import('@/components/sidebar/SourcingSidebarPanel').then((m) => m.SourcingSidebarPanel));
const ProductsSidebarPanel = dynamic(() => import('@/components/sidebar/ProductsSidebarPanel').then((m) => m.ProductsSidebarPanel));
const WalkInSidebarPanel = dynamic(() => import('@/components/sidebar/WalkInSidebarPanel').then((m) => m.WalkInSidebarPanel));
const TechSidebarPanel = dynamic(() => import('@/components/sidebar/TechSidebarPanel').then((m) => m.TechSidebarPanel));
const PackerSidebarPanel = dynamic(() => import('@/components/sidebar/PackerSidebarPanel').then((m) => m.PackerSidebarPanel));
const OutboundSidebarPanel = dynamic(() => import('@/components/sidebar/OutboundSidebarPanel').then((m) => m.OutboundSidebarPanel));
const ReviewSidebarPanel = dynamic(() => import('@/components/sidebar/review/ReviewSidebarPanel').then((m) => m.ReviewSidebarPanel));

/**
 * Route-key dispatcher rendered inside the master-nav as the per-page context
 * panel. Each route maps to its own sidebar panel; the two complex routes
 * (dashboard orders, admin) live in their own components.
 */
export function SidebarContextPanel({ onBackToAppNav }: { onBackToAppNav?: () => void } = {}) {
  const pathname = usePathname();
  const { user } = useAuth();
  const routeKey = getSidebarRouteKey(pathname);

  // Home → Today is rail-less (Pattern E, 2026-08-12). Saved views sit on
  // Band 3 `WorkbenchViewsMenu`; the left column collapsed rather than
  // reserving 360px for a one-section rail. SoT: Incoming / Media Library.
  if (routeKey === 'dashboard') return <DashboardOrdersContextPanel />;

  if (routeKey === 'operations') return <OperationsSidebarPanel />;
  if (routeKey === 'studio') return <StudioSidebarPanel />;
  if (routeKey === 'support') return <SupportSidebarPanel />;
  if (routeKey === 'ai-chat') return <AiChatSidebarPanel />;
  if (routeKey === 'audit-log') return <AuditLogSidebarPanel />;
  if (routeKey === 'receiving') return <ReceivingSidebarPanel />;
  if (routeKey === 'fba') return <FbaSidebarPanel />;
  // `inventory` has NO branch and no rail — the Inventory desk is RAIL-LESS
  // (Pattern E, 2026-09-04), and `/warehouse` + `/inventory/locations` resolve
  // to the same key, so they lose theirs with it. The desk's own DataTable
  // search + DataTableFilterMenu + tabs are the finder now;
  // `CONTEXT_PANEL_ROUTE_KEYS` drops the key so the column collapses rather
  // than reserving 360px of empty chrome.
  if (routeKey === 'sourcing') return <SourcingSidebarPanel />;
  if (routeKey === 'products') return <ProductsSidebarPanel />;
  if (routeKey === 'walk-in') return <WalkInSidebarPanel embedded hideSectionHeader />;
  // (No `repair` branch: `/repair` is a Receiving MODE and resolves to the
  // `receiving` key — see getSidebarRouteKey. The branch that used to sit here
  // could never be reached.)
  if (routeKey === 'tech') {
    // Identity from the verified session cookie. Proxy guarantees user.
    const techId = String(user?.staffId ?? 0);
    return (
      <TechSidebarPanel
        techId={techId}
        onBackToAppNav={onBackToAppNav}
        contextNavTitle={getSidebarTitle(pathname)}
      />
    );
  }

  // `ops-photos` has no branch and no rail — the Media library is RAIL-LESS
  // (Pattern E, 2026-08-09). Its lifecycle scopes are Band-1 tabs and its
  // capture days ride the Band-2 refine popover; `CONTEXT_PANEL_ROUTE_KEYS`
  // drops the key so the column collapses rather than reserving 360px of empty
 // chrome. SoT:.
  if (routeKey === 'packer') return <PackerSidebarPanel />;
  if (routeKey === 'outbound') return <OutboundSidebarPanel />;
  if (routeKey === 'review') return <ReviewSidebarPanel />;
  // `/search` has NO context rail. It used to carry a find bar over "Recently
  // searched" — the documented exception to "find lives only in
  // GlobalHeaderSearch". That exception stopped paying for itself once ⌘K grew
  // its own Recent group: the same list, one keystroke away, on every route
  // rather than only this one. Returning null here drops the key so the column
  // collapses instead of reserving 360px for a duplicate.

  return null;
}
