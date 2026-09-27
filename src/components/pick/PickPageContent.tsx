'use client';

import { PickDashboard } from '@/components/pick/PickDashboard';
import { PickSidebarPanel } from '@/components/sidebar/PickSidebarPanel';
import { RouteShell } from '@/design-system/components/RouteShell';
import { ShippingHistoryFeedProvider } from '@/hooks/station/ShippingHistoryFeedProvider';
import { useSurfaceParamHygiene } from '@/hooks/useSurfaceParamHygiene';
import { useSurfacePaintMark } from '@/lib/observability/paint-timing';

interface PickPageContentProps {
  pickerId: string;
}

/**
 * Picker desk (`/pick`). Desktop renders only `history` (the workspace); the
 * sidebar panel is owned by DashboardSidebar. Narrow viewports flip between
 * Actions (scan band + recents) and History via `?pane=`.
 */
export function PickPageContent({ pickerId }: PickPageContentProps) {
  useSurfaceParamHygiene();
  useSurfacePaintMark('pick:chrome', true);
  useSurfacePaintMark('pick:primary', true);

  return (
    <ShippingHistoryFeedProvider techId={pickerId}>
      <RouteShell
        actions={<PickSidebarPanel pickerId={pickerId} />}
        history={<PickDashboard pickerId={pickerId} />}
      />
    </ShippingHistoryFeedProvider>
  );
}
