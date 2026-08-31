import { Suspense } from 'react';
import { HomeWorkspace } from '@/features/home/HomeWorkspace';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';

/**
 * Home (`/`) — the start-of-shift workbench. Two modes over `?mode=` URL state:
 * `daily` (the checklist + the day's report, and the bare-`/` landing) and
 * `today` (the My Day triage feed).
 *
 * Unparked: bare `/` mounts the workspace instead of redirecting to the
 * dashboard, and the row ships in the Overview drill. Inbox, Tasks and Plan
 * were removed on 2026-08-19 — Plan (the forge console) kept working at its own
 * `/forge` route, which is where its bookmark already pointed.
 *
 * `Suspense` wraps the client workspace because it reads `useSearchParams` for
 * the `?mode=` state (same mount shape as the Operations page). The frame is
 * INSIDE that boundary for the same reason — `DeskPageLayout` reads the params
 * too, to resolve which tab is lit.
 *
 * The frame is the one every desk and station wears as of 2026-08-31
 * (`@/design-system/components/DeskPageChrome`): the page title top-left and
 * Daily · Today · Tasks as its tab row, drawn from this page's own
 * `SIDEBAR_PAGE_NAV` children rather than a mode rail of its own.
 */
export default function Home() {
  return (
    <Suspense>
      <DeskPageLayout className="h-full">
        <HomeWorkspace />
      </DeskPageLayout>
    </Suspense>
  );
}
