'use client';

import { Suspense, type ReactNode } from 'react';
import { RouteShell } from '@/design-system/components/RouteShell';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { RightPaneOverlayHost } from '@/components/ui/RightPaneOverlay';
import { SurfaceGate } from '@/components/surfaces/SurfaceGate';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import { useSurfaceParamHygiene } from '@/hooks/useSurfaceParamHygiene';

/**
 * `/shipping` — the frame every Shipping mode shares.
 * change to the security model, not to routing — out of scope for this slice.
 */
export default function ShippingLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={(
        <div className="flex h-full w-full items-center justify-center bg-surface-card">
          <LoadingSpinner size="lg" className="text-text-accent" />
        </div>
      )}
    >
      <ShippingFrame>{children}</ShippingFrame>
    </Suspense>
  );
}

function ShippingFrame({ children }: { children: ReactNode }) {
  useRealtimeInvalidation({ dashboard: true });
  // Drop anything this route does not declare — a pasted link, a back-button
  // entry, or the `?mode=` a legacy redirect carried in.
  useSurfaceParamHygiene();

  return (
    <SurfaceGate surfaceKey="outbound">
      {/* Industrial task mode: the To-ship desk, FBA and the scan-out station
          all live under this frame. */}
      <ModeRegion mode="industrial" className="hidden h-full w-full overflow-hidden bg-surface-card md:flex">
        <RouteShell
          actions={null}
          history={(
            <RightPaneOverlayHost className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {children}
            </RightPaneOverlayHost>
          )}
        />
      </ModeRegion>
    </SurfaceGate>
  );
}
