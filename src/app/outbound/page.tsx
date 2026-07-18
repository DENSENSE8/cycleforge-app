'use client';

import { Suspense } from 'react';
import { RouteShell } from '@/design-system/components/RouteShell';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { OutboundSidebarPanel } from '@/components/sidebar/OutboundSidebarPanel';
import { OutboundWorkspace } from '@/components/outbound/OutboundWorkspace';
import { RightPaneOverlayHost } from '@/components/ui/RightPaneOverlay';
import { SurfaceGate } from '@/components/surfaces/SurfaceGate';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';

function OutboundPageContent() {
  useRealtimeInvalidation({ dashboard: true });

  // Wrapped in `SurfaceGate surfaceKey="outbound"` (operator-surfaces refactor
  // Phase 9): when the org publishes a composition AND enables the
  // `surface_composed_render` flag, the data-driven `SurfaceRenderer` renders;
  // otherwise this proven legacy tree renders unchanged (the safe default).
  // RightPaneOverlayHost pins Order Sync (and future pane overlays) over the
  // workspace column — same pattern as ReceivingRightPane / TechDashboard.
  return (
    <SurfaceGate surfaceKey="outbound">
      <div className="hidden h-full w-full overflow-hidden bg-surface-card md:flex">
        <RouteShell
          actions={<OutboundSidebarPanel />}
          history={(
            <RightPaneOverlayHost className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <OutboundWorkspace />
            </RightPaneOverlayHost>
          )}
        />
      </div>
    </SurfaceGate>
  );
}

export default function OutboundPage() {
  return (
    <Suspense
      fallback={(
        <div className="flex h-full w-full items-center justify-center bg-surface-card">
          <LoadingSpinner size="lg" className="text-violet-600" />
        </div>
      )}
    >
      <OutboundPageContent />
    </Suspense>
  );
}
