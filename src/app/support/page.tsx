'use client';

import { Suspense } from 'react';
import { RouteShell } from '@/design-system/components/RouteShell';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { SupportSidebarPanel } from '@/components/sidebar/SupportSidebarPanel';
import { SupportWorkspace } from '@/components/support/zendesk/SupportWorkspace';
import { RightPaneOverlayHost } from '@/components/ui/RightPaneOverlay';
import { SurfaceGate } from '@/components/surfaces/SurfaceGate';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';

/** `/support` — the Support operator Station (promoted More → Stations). */
function SupportPageContent() {
  return (
    <SurfaceGate surfaceKey="support">
      <div className="hidden h-full w-full overflow-hidden bg-surface-card md:flex">
        <RouteShell
          actions={<SupportSidebarPanel />}
          history={(
            <RightPaneOverlayHost className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {/* The one page frame (2026-08-31) — inside the RouteShell's content pane, not around it, so the ticket rail keeps its own column. */}
              <DeskPageLayout className="h-full">
                <SupportWorkspace />
              </DeskPageLayout>
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
