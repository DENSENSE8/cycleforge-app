'use client';

import TechDashboard from '@/components/TechDashboard';
import { TechSidebarPanel } from '@/components/sidebar/TechSidebarPanel';
import { RouteShell } from '@/design-system/components/RouteShell';
import { ShippingHistoryFeedProvider } from '@/hooks/station/ShippingHistoryFeedProvider';
import { useRealtimeToasts } from '@/hooks/useRealtimeToasts';
import { useSurfaceParamHygiene } from '@/hooks/useSurfaceParamHygiene';
import { useSurfacePaintMark } from '@/lib/observability/paint-timing';

interface TechPageContentProps {
  techId: string;
}

/**
 * Single responsive tree. Desktop renders only `history` (the full TechDashboard);
 * the sidebar panel is owned by DashboardSidebar. Mobile flips between Actions
 * (TechSidebarPanel) and History (TechDashboard) via `?pane=`.
 */
export function TechPageContent({ techId }: TechPageContentProps) {
  useSurfaceParamHygiene();
  useRealtimeToasts('tech');
  useSurfacePaintMark('test:chrome', true);
  useSurfacePaintMark('test:primary', true);

  return (
    <ShippingHistoryFeedProvider techId={techId}>
      <RouteShell
        actions={<TechSidebarPanel techId={techId} contextNavTitle="Testing" />}
        history={<TechDashboard techId={techId} />}
      />
    </ShippingHistoryFeedProvider>
  );
}
