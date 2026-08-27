'use client';

import { useUIMode } from '@/design-system/providers/UIModeProvider';
import { SidebarShell } from '@/components/sidebar/SidebarShell';
import {
  useAuthPermissions,
  useStationDetailsPanel,
} from '@/components/sidebar/dashboard-sidebar-hooks';

interface DashboardSidebarProps {
  /** Rendered inside ResponsiveLayout's mobile drawer (it owns positioning + backdrop). */
  inDrawer?: boolean;
  /** Called when the user navigates from within the sidebar. */
  onNavigate?: () => void;
}

/**
 * Thin composition layer for the nav spine. State + side effects live in
 * `dashboard-sidebar-hooks`; the chrome lives in `SidebarShell`. The route's own
 * sidebar is NOT here — it mounts beside the workspace via `ContextPanelLayout`.
 *
 * It owns **no geometry**. The host supplies the width — `SidebarNavColumn` on
 * desktop or the mobile drawer — so the two mounts cannot disagree about it.
 */
export function DashboardSidebar({
  inDrawer = false,
  onNavigate,
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
    />
  );
}
