'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { RouteShell } from '@/design-system/components/RouteShell';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { CounterWorkspace } from '@/components/counter/CounterWorkspace';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';

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
        history={(
          /*
            Counter is a SALES child, not a Scan Station — `getSidebarNavPageId`
            answers `sales` for this path — so the frame here draws Sales' title
            and its four tabs with Counter lit. Switching tabs lands on
            `/dashboard?mode=…`, which wears the same frame: the strip does not
            blink out from under the operator on the one tab that changes route.
          */
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
