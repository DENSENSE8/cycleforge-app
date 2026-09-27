'use client';

import TechDashboard from '@/components/TechDashboard';
import { TestingSidebarPanel } from '@/components/sidebar/TestingSidebarPanel';
import { RouteShell } from '@/design-system/components/RouteShell';
import { useRealtimeToasts } from '@/hooks/useRealtimeToasts';
import { useSurfaceParamHygiene } from '@/hooks/useSurfaceParamHygiene';
import { useSurfacePaintMark } from '@/lib/observability/paint-timing';

interface TechPageContentProps {
  techId: string;
}

/**
 * Quality Control bench (`/test`). Desktop renders only `history` (the full
 * TechDashboard); the sidebar panel is owned by DashboardSidebar. Narrow
 * viewports flip between Actions (TestingSidebarPanel) and History via `?pane=`.
 */
export function TechPageContent({ techId }: TechPageContentProps) {
  useSurfaceParamHygiene();
  useRealtimeToasts('tech');
  useSurfacePaintMark('test:chrome', true);
  useSurfacePaintMark('test:primary', true);

  return (
    <RouteShell
      actions={<TestingSidebarPanel staffId={techId} />}
      history={<TechDashboard techId={techId} />}
    />
  );
}
