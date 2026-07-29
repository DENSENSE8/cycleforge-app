'use client';

import { useUIMode } from '@/design-system/providers/UIModeProvider';
import { SidebarShell } from '@/components/sidebar/SidebarShell';
import {
  useAuthPermissions,
  useStationDetailsPanel,
} from '@/components/sidebar/dashboard-sidebar-hooks';

export interface DashboardSidebarProps {
  /** Rendered inside ResponsiveLayout's mobile drawer (it owns positioning + backdrop). */
  inDrawer?: boolean;
  /** Called when the user navigates from within the sidebar. */
  onNavigate?: () => void;
  /** Render the page list (the slide-over mount) instead of the route's sidebar. */
  navOnly?: boolean;
  /** Open the page-list slide-over (from the resident column's band chevron). */
  onOpenNav?: () => void;
}

/**
 * Thin composition layer for the sidebar. State + side effects live in
 * `dashboard-sidebar-hooks`; the chrome lives in `SidebarShell`; the route's own
 * sidebar lives in `SidebarContextPanel`.
 *
 * It owns **no geometry**. The host supplies the width — a resident column or
 * {@link SidebarSlideOver} — so the two mounts cannot disagree about it. (This
 * component used to hardcode `w-[360px]`, which is how a route with no sidebar
 * ended up reserving 360px of empty chrome: the width was unconditional and
 * nothing in the system could say the panel was absent.)
 */
export default function DashboardSidebar({
  inDrawer = false,
  onNavigate,
  navOnly = false,
  onOpenNav,
}: DashboardSidebarProps) {
  const { isMobile } = useUIMode();
  const permissions = useAuthPermissions();
  useStationDetailsPanel();

  return (
    <SidebarShell
      permissions={permissions}
      mobileRestricted={isMobile}
      onNavigate={onNavigate}
      inDrawer={inDrawer}
      navOnly={navOnly}
      onOpenNav={onOpenNav}
    />
  );
}
