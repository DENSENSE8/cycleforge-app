'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { RouteShell } from '@/design-system/components/RouteShell';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { CounterWorkspace } from '@/components/counter/CounterWorkspace';

/**
 * `/counter` — the desk side of the shared counter session.
 *
 * Lives in the **Sales** domain section, not Scan Stations: this surface has no
 * scanner and mounts no Station chrome, and Scan Stations groups a
 * scanner-driven input model (`StationGroupId` docblock). A counter visit is a
 * sale — Sales already owns the boards that REVIEW sales; this is where one is
 * MADE.
 *
 * `?session={id}` selects the visit. Which tablet it drives is a property of
 * the session (its bound `kiosk_device_id`), so the URL stays a link a staffer
 * can hand to whoever takes over.
 *
 * Plan: `docs/todo/kiosk-desk-session-channel-PLAN.md` (P5).
 */
function CounterPageContent() {
  const params = useSearchParams();
  const raw = params.get('session');
  const parsed = Number(raw);
  const sessionId = Number.isInteger(parsed) && parsed > 0 ? parsed : null;

  return (
    <div className="hidden h-full w-full overflow-hidden bg-surface-card md:flex">
      <RouteShell
        actions={null}
        history={<CounterWorkspace sessionId={sessionId} />}
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
