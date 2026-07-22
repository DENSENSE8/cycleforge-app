'use client';

import { Suspense } from 'react';
import { RouteShell } from '@/design-system/components/RouteShell';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { SupportSidebarPanel } from '@/components/sidebar/SupportSidebarPanel';
import { SupportWorkspace } from '@/components/support/zendesk/SupportWorkspace';
import { RightPaneOverlayHost } from '@/components/ui/RightPaneOverlay';
import { SurfaceGate } from '@/components/surfaces/SurfaceGate';

/**
 * `/support` — the Support operator Station (promoted More → Stations).
 * Mounted like the other floor stations: `SurfaceGate` (legacy tree is the safe
 * default until an org publishes a composition) + `RouteShell` (sidebar owned by
 * `DashboardSidebar` on desktop; `history` = the workspace body). The Tickets
 * mode focus pane adopts Unbox Station Workbench anatomy inside the workspace.
 *
 * Desktop console (mobile-restricted): the shell renders `hidden … md:flex`,
 * matching Shipping — the phone path is served under /m, not this route.
 */
function SupportPageContent() {
  return (
    <SurfaceGate surfaceKey="support">
      <div className="hidden h-full w-full overflow-hidden bg-surface-card md:flex">
        <RouteShell
          actions={<SupportSidebarPanel />}
          history={(
            <RightPaneOverlayHost className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <SupportWorkspace />
            </RightPaneOverlayHost>
          )}
        />
      </div>
    </SurfaceGate>
  );
}

export default function SupportPage() {
  return (
    <Suspense
      fallback={(
        <div className="flex h-full w-full items-center justify-center bg-surface-card">
          <LoadingSpinner size="lg" className="text-violet-600" />
        </div>
      )}
    >
      <SupportPageContent />
    </Suspense>
  );
}
