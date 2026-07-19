'use client';

import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useAuth } from '@/contexts/AuthContext';
import { getSidebarRouteKey } from '@/lib/sidebar-navigation';
import { getSidebarTitle } from '@/lib/sidebar-titles';
import { ParkedSurface } from '@/components/dogfood/ParkedSurface';
import {
  isParkedSurfaceBlocked,
  isParkedSurfaceKey,
} from '@/lib/dogfood/parked-surfaces';

// Every panel is code-split on the route key. Static imports here would drag
// every feature area's sidebar graph (orders, FBA, studio, support, …) into
// the shared shell bundle on every page — this dispatcher is exactly where the
// per-route chunk boundary belongs. SSR stays on (default), so the active
// route's panel is still server-rendered into the first HTML; the client only
// downloads the one chunk its route needs.
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
const WarehouseSidebarPanel = dynamic(() => import('@/components/sidebar/WarehouseSidebarPanel').then((m) => m.WarehouseSidebarPanel));
const WalkInSidebarPanel = dynamic(() => import('@/components/sidebar/WalkInSidebarPanel').then((m) => m.WalkInSidebarPanel));
const ManualsLibrarySidebar = dynamic(() => import('@/components/manuals/ManualsLibrarySidebar').then((m) => m.ManualsLibrarySidebar));
const TechSidebarPanel = dynamic(() => import('@/components/sidebar/TechSidebarPanel').then((m) => m.TechSidebarPanel));
const PhotoLibrarySidebarPanel = dynamic(() => import('@/components/photos/PhotoLibrarySidebarPanel').then((m) => m.PhotoLibrarySidebarPanel));
const PackerSidebarPanel = dynamic(() => import('@/components/sidebar/PackerSidebarPanel').then((m) => m.PackerSidebarPanel));
const OutboundSidebarPanel = dynamic(() => import('@/components/sidebar/OutboundSidebarPanel').then((m) => m.OutboundSidebarPanel));

/**
 * Route-key dispatcher rendered inside the master-nav as the per-page context
 * panel. Each route maps to its own sidebar panel; the two complex routes
 * (dashboard orders, admin) live in their own components.
 *
 * Parked dogfood surfaces never mount their real panels — they render the same
 * stand-in as the main pane (`ParkedSurface` sidebar variant).
 */
export function SidebarContextPanel({ onBackToAppNav }: { onBackToAppNav?: () => void } = {}) {
  const pathname = usePathname();
  const { user } = useAuth();
  const routeKey = getSidebarRouteKey(pathname);

  // Complete park: block real FBA/Studio/… sidebars, not just the main pane.
  if (isParkedSurfaceBlocked(routeKey) && isParkedSurfaceKey(routeKey)) {
    return <ParkedSurface surface={routeKey} variant="sidebar" />;
  }

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
  if (routeKey === 'warehouse') return <WarehouseSidebarPanel />;
  if (routeKey === 'walk-in') return <WalkInSidebarPanel embedded hideSectionHeader />;
  if (routeKey === 'repair') return <WalkInSidebarPanel embedded hideSectionHeader />;
  if (routeKey === 'manuals-library') return <ManualsLibrarySidebar />;

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

  if (routeKey === 'ops-photos') return <PhotoLibrarySidebarPanel />;
  if (routeKey === 'packer') return <PackerSidebarPanel />;
  if (routeKey === 'outbound') return <OutboundSidebarPanel />;

  return null;
}
