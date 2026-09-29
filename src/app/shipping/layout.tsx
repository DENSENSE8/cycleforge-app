'use client';

import { Suspense, type ReactNode } from 'react';
import { RouteShell } from '@/design-system/components/RouteShell';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { RightPaneOverlayHost } from '@/components/ui/RightPaneOverlay';
import { SurfaceGate } from '@/components/surfaces/SurfaceGate';
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
  // Drop anything this route does not declare — a pasted link, a back-button
  // entry, or the `?mode=` a legacy redirect carried in.
  useSurfaceParamHygiene();

  // The mode region is the app frame's (`RouteModeRegion`, triage from the
  // registry) — the desktop has no Floor (owner 2026-09-28).
  const shell = (
    <RouteShell
      actions={null}
      history={(
        <RightPaneOverlayHost className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {children}
        </RightPaneOverlayHost>
      )}
    />
  );

  return (
    <SurfaceGate surfaceKey="outbound">
      {/* Rendered at every width (owner 2026-09-27, mobile first): a `hidden md:flex`
          gate here blanked the page under 768px. */}
      <div className="flex h-full w-full overflow-hidden bg-surface-card">{shell}</div>
    </SurfaceGate>
  );
}
