'use client';

/**
 * Walk-In counter station page (`/pickup`) — the front-desk bench, with its own
 * identity rather than a Receiving mode. Job via `?job=sales|pickup|repair`
 * (default pickup, SoT `src/lib/walk-in/jobs.ts`).
 *
 * Deliberately NOT `ReceivingSurfacePage`: that shell brings the Receiving mode
 * rail and the mobile unbox photo feed, neither of which belongs at a counter
 * (FOH/BOH split — `docs/todo/foh-boh-surface-split/02-walk-in-station.md`).
 *
 * On desktop `RouteShell` renders the pane only — the sidebar half is mounted
 * by `SidebarContextPanel`, which resolves `/pickup` to the Walk-In station
 * sidebar. Below the mobile breakpoint `RouteShell` flips between the two.
 */

import { Suspense } from 'react';
import { RouteShell } from '@/design-system/components/RouteShell';
import { WalkInStationPane } from '@/components/walk-in/WalkInStationPane';
import { WalkInStationSidebar } from '@/components/walk-in/WalkInStationSidebar';

function WalkInSurfacePageInner() {
  return (
    <div className="flex h-full w-full overflow-hidden bg-surface-canvas">
      <RouteShell
        actions={<WalkInStationSidebar />}
        history={<WalkInStationPane />}
        actionsLabel="Counter"
        historyLabel="Workspace"
      />
    </div>
  );
}

export function WalkInSurfacePage() {
  return (
    <Suspense>
      <WalkInSurfacePageInner />
    </Suspense>
  );
}
