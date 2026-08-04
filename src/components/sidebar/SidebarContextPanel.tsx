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
const HomeContextPanel = dynamic(() => import('@/components/sidebar/HomeContextPanel').then((m) => m.HomeContextPanel));
const DashboardOrdersContextPanel = dynamic(() => import('@/components/sidebar/DashboardOrdersContextPanel').then((m) => m.DashboardOrdersContextPanel));
const OrderWorkspaceSidebar = dynamic(() => import('@/components/sidebar/order/OrderWorkspaceSidebar').then((m) => m.OrderWorkspaceSidebar));
const AdminContextPanel = dynamic(() => import('@/components/sidebar/AdminContextPanel').then((m) => m.AdminContextPanel));
const OperationsSidebarPanel = dynamic(() => import('@/components/sidebar/OperationsSidebarPanel').then((m) => m.OperationsSidebarPanel));
const StudioSidebarPanel = dynamic(() => import('@/components/sidebar/StudioSidebarPanel').then((m) => m.StudioSidebarPanel));
const SupportSidebarPanel = dynamic(() => import('@/components/sidebar/SupportSidebarPanel').then((m) => m.SupportSidebarPanel));
const AiChatSidebarPanel = dynamic(() => import('@/components/sidebar/AiChatSidebarPanel').then((m) => m.AiChatSidebarPanel));
const SettingsSidebar = dynamic(() => import('@/components/sidebar/SettingsSidebarPanel').then((m) => m.SettingsSidebar));
const AuditLogSidebarPanel = dynamic(() => import('@/components/sidebar/AuditLogSidebarPanel').then((m) => m.AuditLogSidebarPanel));
const ReceivingSidebarPanel = dynamic(() => import('@/components/sidebar/ReceivingSidebarPanel').then((m) => m.ReceivingSidebarPanel));
const FbaSidebarPanel = dynamic(() => import('@/components/fba/sidebar').then((m) => m.FbaSidebarPanel));
const InventorySidebarPanel = dynamic(() => import('@/components/sidebar/InventorySidebarPanel').then((m) => m.InventorySidebarPanel));
const SourcingSidebarPanel = dynamic(() => import('@/components/sidebar/SourcingSidebarPanel').then((m) => m.SourcingSidebarPanel));
const ProductsSidebarPanel = dynamic(() => import('@/components/sidebar/ProductsSidebarPanel').then((m) => m.ProductsSidebarPanel));
const WalkInSidebarPanel = dynamic(() => import('@/components/sidebar/WalkInSidebarPanel').then((m) => m.WalkInSidebarPanel));
const TechSidebarPanel = dynamic(() => import('@/components/sidebar/TechSidebarPanel').then((m) => m.TechSidebarPanel));
const PackerSidebarPanel = dynamic(() => import('@/components/sidebar/PackerSidebarPanel').then((m) => m.PackerSidebarPanel));
const OutboundSidebarPanel = dynamic(() => import('@/components/sidebar/OutboundSidebarPanel').then((m) => m.OutboundSidebarPanel));
const ReviewSidebarPanel = dynamic(() => import('@/components/sidebar/review/ReviewSidebarPanel').then((m) => m.ReviewSidebarPanel));
const SearchSidebarPanel = dynamic(() => import('@/components/sidebar/search/SearchSidebarPanel').then((m) => m.SearchSidebarPanel));
// Static: Media library facet rail owns `scope-icons` + `date-tree`. A dynamic
// import left those SoT modules invisible to knip (and paid no bundle win —
// `/ops/photos` is the only consumer and already code-splits the page).
import { PhotoLibrarySidebarPanel } from '@/components/photos/PhotoLibrarySidebarPanel';

/**
 * Route-key dispatcher rendered inside the master-nav as the per-page context
 * panel. Each route maps to its own sidebar panel; the two complex routes
 * (dashboard orders, admin) live in their own components.
 */
export function SidebarContextPanel({ onBackToAppNav }: { onBackToAppNav?: () => void } = {}) {
  const pathname = usePathname();
  const { user } = useAuth();
  const routeKey = getSidebarRouteKey(pathname);

  // Home → Today: the operator's saved views over the Today spreadsheet. Every
  // other Today control is chrome by rule — see HomeContextPanel's docblock.
  if (routeKey === 'home') return <HomeContextPanel />;
  if (routeKey === 'dashboard') return <DashboardOrdersContextPanel />;
  if (routeKey === 'order') return <OrderWorkspaceSidebar />;
  if (routeKey === 'admin') return <AdminContextPanel />;

  if (routeKey === 'operations') return <OperationsSidebarPanel />;
  if (routeKey === 'studio') return <StudioSidebarPanel />;
  if (routeKey === 'support') return <SupportSidebarPanel />;
  if (routeKey === 'ai-chat') return <AiChatSidebarPanel />;
  if (routeKey === 'settings') return <SettingsSidebar />;
  if (routeKey === 'audit-log') return <AuditLogSidebarPanel />;
  if (routeKey === 'receiving') return <ReceivingSidebarPanel />;
  if (routeKey === 'fba') return <FbaSidebarPanel />;
  // /inventory's main shell owns its own header search + filter chips; the
  // panel here carries the section toggle (Inventory ↔ Replenish) plus the
  // tabbed inventory / replenish sidebars.
  if (routeKey === 'inventory') return <InventorySidebarPanel />;
  if (routeKey === 'sourcing') return <SourcingSidebarPanel />;
  if (routeKey === 'products') return <ProductsSidebarPanel />;
  // Locations desk folded under inventory — WarehouseSidebarPanel mounts via InventorySidebarPanel.
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

  // Media library: lifecycle scope + capture-day drill live in the resident rail;
  // search / filters / media type / sort stay in the workbench chrome header.
  if (routeKey === 'ops-photos') return <PhotoLibrarySidebarPanel />;
  if (routeKey === 'packer') return <PackerSidebarPanel />;
  if (routeKey === 'outbound') return <OutboundSidebarPanel />;
  if (routeKey === 'review') return <ReviewSidebarPanel />;
  if (routeKey === 'search') return <SearchSidebarPanel />;

  return null;
}
