'use client';

import { useUIMode } from '@/design-system/providers/UIModeProvider';
import { SidebarShell } from '@/components/sidebar/SidebarShell';
import { useAuthPermissions } from '@/components/sidebar/dashboard-sidebar-hooks';

interface DashboardSidebarProps {
  /** Rendered inside ResponsiveLayout's mobile drawer (it owns positioning + backdrop). */
  inDrawer?: boolean;
  /** Called when the user navigates from within the sidebar. */
  onNavigate?: () => void;
}

/** Thin composition layer for the nav spine. */
export function DashboardSidebar({
  inDrawer = false,
  onNavigate,
}: DashboardSidebarProps) {
  const { isMobile } = useUIMode();
  const permissions = useAuthPermissions();

  return (
    <SidebarShell
      permissions={permissions}
      mobileRestricted={isMobile}
      onNavigate={onNavigate}
      inDrawer={inDrawer}
    />
  );
}
