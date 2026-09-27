'use client';

import { Suspense, type ReactNode } from 'react';
import { RouteShell } from '@/design-system/components/RouteShell';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
import { useDeskFloorActive } from '@/design-system/components/DeskStageContext';
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

  // Floor (⌘/Ctrl+Shift+F on To ship) is the one industrial desktop view
  // (BRIEF §12 Mode D): the PAGE region flips, so the ledger and whatever it
  // portals (note editor, dialogs that re-declare triage) stay one level deep.
  const floor = useDeskFloorActive();

  return (
    <SurfaceGate surfaceKey="outbound">
      {/* Triage on desktop (BRIEF §12): the To-ship desk, FBA and the scan-out station
          all live under this frame. Rendered at every width (owner 2026-09-27,
          mobile first): a `hidden md:flex` gate here blanked the page under 768px. */}
      <ModeRegion mode={floor ? 'industrial' : 'triage'} className="flex h-full w-full overflow-hidden bg-surface-card">
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
