import { Suspense } from 'react';
import { HomeWorkspace } from '@/features/home/HomeWorkspace';

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
 * the `?mode=` state (same mount shape as the Operations page).
 */
export default function Home() {
  return (
    <Suspense>
      <HomeWorkspace />
    </Suspense>
  );
}
