'use client';

import { Suspense, type ReactNode } from 'react';
import { RouteShell } from '@/design-system/components/RouteShell';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { OutboundSidebarPanel } from '@/components/sidebar/OutboundSidebarPanel';
import { RightPaneOverlayHost } from '@/components/ui/RightPaneOverlay';
import { SurfaceGate } from '@/components/surfaces/SurfaceGate';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import { useSurfaceParamHygiene } from '@/hooks/useSurfaceParamHygiene';

/**
 * `/shipping` — the frame every Shipping mode shares.
 *
 * The modes are route segments now (`labels` / `ready` / `fba` / `scan-out`),
 * so being on the path IS the mode; there is no `?mode=` to branch on. Each
 * segment's `page.tsx` supplies only its workspace, and this layout holds the
 * parts that must not remount when the operator switches: the surface gate, the
 * realtime subscription, and the shell.
 *
 * It does NOT own the sidebar panel on desktop — `SidebarContextPanel` mounts
 * that from the app shell, keyed on the route. `RouteShell`'s `actions` slot is
 * the MOBILE tab only, which is why the panel still appears here.
 *
 * Permission is unchanged: `shipping.view` is enforced per API route and by nav
 * filtering, exactly as before. Adding a server-side page gate here would be a
 * change to the security model, not to routing — out of scope for this slice.
 */
export default function ShippingLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={(
        <div className="flex h-full w-full items-center justify-center bg-surface-card">
          <LoadingSpinner size="lg" className="text-violet-600" />
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
      <div className="hidden h-full w-full overflow-hidden bg-surface-card md:flex">
        <RouteShell
          actions={<OutboundSidebarPanel />}
          history={(
            <RightPaneOverlayHost className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {children}
            </RightPaneOverlayHost>
          )}
        />
      </div>
    </SurfaceGate>
  );
}
