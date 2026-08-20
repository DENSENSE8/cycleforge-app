import { Suspense } from 'react';
import { AgenticLoopLiveConsole } from '@/components/forge/AgenticLoopLiveConsole';

/**
 * `/forge` — Plans Live: the master-plan MDX + TicketStatus + plan agent.
 *
 * A REAL route as of 2026-08-19, not a redirect. It used to `redirect()` into
 * `/?mode=forge&view=live`, because the console was mounted as a Home mode.
 * Home was cut back to Daily + Today, so the console came back out to the path
 * it always had a bookmark for — nothing about it changed except its host.
 *
 * Gate: `operations.plans.view`, via `ROUTE_PERMISSIONS` in
 * `sidebar-navigation.ts` (same permission the Plans spine pin carries and the
 * `/api/forge/master-plan` route enforces). The console self-gated while it was
 * a Home mode; on its own path the route map is the honest place for it.
 *
 * `Suspense` wraps it because it reads `useSearchParams` for `?view=` / `?ticket=`
 * (same mount shape as `app/page.tsx`).
 */
export default function ForgePage() {
  return (
    <Suspense>
      <div className="flex h-[calc(100vh-64px)] min-h-0 flex-col overflow-hidden bg-surface-canvas px-4 py-4">
        <AgenticLoopLiveConsole />
      </div>
    </Suspense>
  );
}
