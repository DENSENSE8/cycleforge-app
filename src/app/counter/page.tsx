'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { RouteShell } from '@/design-system/components/RouteShell';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { CounterWorkspace } from '@/components/counter/CounterWorkspace';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';

/** `/counter` — the desk side of the shared counter session. */
function CounterPageContent() {
  const params = useSearchParams();
  const raw = params.get('session');
  const parsed = Number(raw);
  const sessionId = Number.isInteger(parsed) && parsed > 0 ? parsed : null;

  return (
    <div className="hidden h-full w-full overflow-hidden bg-surface-card md:flex">
      <RouteShell
        actions={null}
        history={(
          /* Counter is a SALES child, not a Scan Station — `getSidebarNavPageId` answers `sales` for this path — so the frame here draws Sales'… */
          <DeskPageLayout className="h-full">
            <CounterWorkspace sessionId={sessionId} />
          </DeskPageLayout>
        )}
      />
    </div>
  );
}

export default function CounterPage() {
  return (
    <Suspense
      fallback={(
        <div className="flex h-full w-full items-center justify-center bg-surface-card">
          <LoadingSpinner size="lg" />
        </div>
      )}
    >
      <CounterPageContent />
    </Suspense>
  );
}
