'use client';

/** Quality Control bench (`/test`) — thin composition layer over the testing workspace and its overlays. */

import { RightPaneOverlayHost } from '@/components/ui/RightPaneOverlay';
import { TestingLineWorkspace } from '@/components/tech/TestingLineWorkspace';

interface TechDashboardProps {
  techId: string;
}

export default function TechDashboard({ techId }: TechDashboardProps) {
  return (
    <div className="relative flex h-full w-full flex-col">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <RightPaneOverlayHost className="relative flex h-full min-h-0 flex-col overflow-hidden">
            {/* The rail owns the queue; a focused line opens on this stage. */}
            <TestingLineWorkspace staffId={techId} />
          </RightPaneOverlayHost>
        </div>
      </div>
    </div>
  );
}
