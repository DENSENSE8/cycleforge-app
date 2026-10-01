'use client';

/** Shared receiving-surface page shell — the desktop sidebar + right-pane (`RouteShell`) mounted by `/unbox`, `/triage`, `/receiving`… */

import { Suspense } from 'react';
import ReceivingDashboard from '@/components/ReceivingDashboard';
import { ReceivingSidebarPanel } from '@/components/sidebar/ReceivingSidebarPanel';
import { RouteShell } from '@/design-system/components/RouteShell';

function ReceivingSurfacePageInner() {
  return (
    <div className="flex h-full w-full overflow-hidden">
      <RouteShell
        actions={<ReceivingSidebarPanel />}
        history={<ReceivingDashboard />}
      />
    </div>
  );
}

export function ReceivingSurfacePage() {
  return (
    // Fallback fills the page slot with the app wash while useSearchParams
    // suspends (SSR/hydration) — a bare Suspense here rendered a white void.
    <Suspense fallback={<div className="h-full w-full" aria-hidden />}>
      <ReceivingSurfacePageInner />
    </Suspense>
  );
}
