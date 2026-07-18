'use client';

import { Suspense } from 'react';
import { RouteShell } from '@/design-system/components/RouteShell';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { OutboundSidebarPanel } from '@/components/sidebar/OutboundSidebarPanel';
import { OutboundWorkspace } from '@/components/outbound/OutboundWorkspace';
import { RightPaneOverlayHost } from '@/components/ui/RightPaneOverlay';
import { SurfaceGate } from '@/components/surfaces/SurfaceGate';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';

/**
 * `/shipping` — the Shipping operator surface (canonical route).
 * Sidebar label + `shipping.view` permission + address bar all say shipping.
 * Legacy `/outbound` is a permanent redirect only (no page remains).
 *
 * Surface key stays `outbound` for composition / Studio stability (same pattern
 * as Packing: route `/pack`, panel id `packer`).
 */
function ShippingPageContent() {
  useRealtimeInvalidation({ dashboard: true });

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

export default function ShippingPage() {
  return (
    <Suspense
      fallback={(
        <div className="flex h-full w-full items-center justify-center bg-surface-card">
          <LoadingSpinner size="lg" className="text-violet-600" />
        </div>
      )}
    >
      <ShippingPageContent />
    </Suspense>
  );
}
