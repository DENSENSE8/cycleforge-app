'use client';

import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useAuth } from '@/contexts/AuthContext';
import { getSidebarRouteKey } from '@/lib/sidebar-navigation';

// Every panel is code-split on the route key.
const DashboardOrdersContextPanel = dynamic(() => import('@/components/sidebar/DashboardOrdersContextPanel').then((m) => m.DashboardOrdersContextPanel));
const OperationsSidebarPanel = dynamic(() => import('@/components/sidebar/OperationsSidebarPanel').then((m) => m.OperationsSidebarPanel));
const StudioSidebarPanel = dynamic(() => import('@/components/sidebar/StudioSidebarPanel').then((m) => m.StudioSidebarPanel));
const SupportSidebarPanel = dynamic(() => import('@/components/sidebar/SupportSidebarPanel').then((m) => m.SupportSidebarPanel));
const RolesSidebarPanel = dynamic(() => import('@/components/admin/RolesSidebarPanel').then((m) => m.RolesSidebarPanel));
const AccessSidebarPanel = dynamic(() => import('@/components/admin/AccessSidebarPanel').then((m) => m.AccessSidebarPanel));
const AuditLogSidebarPanel = dynamic(() => import('@/components/sidebar/AuditLogSidebarPanel').then((m) => m.AuditLogSidebarPanel));
const ReceivingSidebarPanel = dynamic(() => import('@/components/sidebar/ReceivingSidebarPanel').then((m) => m.ReceivingSidebarPanel));
const FbaSidebarPanel = dynamic(() => import('@/components/fba/sidebar').then((m) => m.FbaSidebarPanel));
const ProductsSidebarPanel = dynamic(() => import('@/components/sidebar/ProductsSidebarPanel').then((m) => m.ProductsSidebarPanel));
const WalkInSidebarPanel = dynamic(() => import('@/components/sidebar/WalkInSidebarPanel').then((m) => m.WalkInSidebarPanel));
const TestingSidebarPanel = dynamic(() => import('@/components/sidebar/TestingSidebarPanel').then((m) => m.TestingSidebarPanel));
const PickSidebarPanel = dynamic(() => import('@/components/sidebar/PickSidebarPanel').then((m) => m.PickSidebarPanel));
const PackerSidebarPanel = dynamic(() => import('@/components/sidebar/PackerSidebarPanel').then((m) => m.PackerSidebarPanel));
const ReviewSidebarPanel = dynamic(() => import('@/components/sidebar/review/ReviewSidebarPanel').then((m) => m.ReviewSidebarPanel));

/**
 * Route-key dispatcher rendered inside the master-nav as the per-page context
 * panel. Each route maps to its own sidebar panel; the two complex routes
 * (dashboard orders, admin) live in their own components.
 */
export function SidebarContextPanel() {
  const pathname = usePathname();
  const { user } = useAuth();
  const routeKey = getSidebarRouteKey(pathname);

  // Home → Today is rail-less (Pattern E, 2026-08-12). Saved views sit on
  // Band 3 `WorkbenchViewsMenu`; the left column collapsed rather than
  // reserving 360px for a one-section rail. SoT: Incoming / Media Library.
  if (routeKey === 'dashboard') return <DashboardOrdersContextPanel />;

  if (routeKey === 'operations') return <OperationsSidebarPanel />;
  // `/studio/automations` never reaches here — it is rail-less (SoT:
  // `isRaillessSurface`), so `ContextPanelLayout` mounts no panel at all.
  if (routeKey === 'studio') return <StudioSidebarPanel />;
  if (routeKey === 'support') return <SupportSidebarPanel />;
  // Settings overview is railless (card landing). Roles / Access keep their
  // picker panels — the editors still say "choose from the sidebar".
  if (routeKey === 'settings') {
    if (pathname === '/settings/roles' || pathname.startsWith('/settings/roles/')) {
      return <RolesSidebarPanel basePath="/settings/roles" />;
    }
    if (pathname === '/settings/access' || pathname.startsWith('/settings/access/')) {
      return <AccessSidebarPanel basePath="/settings/access" />;
    }
    return null;
  }
  if (routeKey === 'audit-log') return <AuditLogSidebarPanel />;
  if (routeKey === 'receiving') return <ReceivingSidebarPanel />;
  if (routeKey === 'fba') return <FbaSidebarPanel />;
  // Inventory is rail-less (operator 2026-09-15) — ledger, locations, graph,
  // triage, pulse, replenish. The column key is dropped; do not remount
  // InventorySidebarPanel / WarehouseSidebarPanel here.
  if (routeKey === 'products') return <ProductsSidebarPanel />;
  if (routeKey === 'walk-in') return <WalkInSidebarPanel embedded hideSectionHeader />;
  // (No `repair` branch: `/repair` is a Receiving MODE and resolves to the
  // `receiving` key — see getSidebarRouteKey. The branch that used to sit here
  // could never be reached.)
  // Identity from the verified session cookie. Proxy guarantees user.
  // Quality Control bench (`/test`, legacy `/tech`).
  if (routeKey === 'tech') return <TestingSidebarPanel staffId={String(user?.staffId ?? 0)} />;
  // Picker desk (`/pick`).
  if (routeKey === 'pick') return <PickSidebarPanel pickerId={String(user?.staffId ?? 0)} />;

  // `ops-photos` has no branch and no rail — the Media library is RAIL-LESS (Pattern E, 2026-08-09).
  if (routeKey === 'packer') return <PackerSidebarPanel />;
  // `outbound` has no branch: the Shipping desk's search · views · focus ·
  // saved views live IN the master nav (`OutboundDeskSpine`), not in a
  // second left column (operator 2026-09-26).
  if (routeKey === 'review') return <ReviewSidebarPanel />;
  // `/search` has NO context rail.

  return null;
}
