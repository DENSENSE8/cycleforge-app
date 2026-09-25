import { Suspense } from 'react';
import { HomeWorkspace } from '@/features/home/HomeWorkspace';
import { ModeRegion } from '@/design-system/providers/ModeRegion';

/**
 * Daily (`/`, was Home) — the start-of-shift checklist, single surface.
 *
 * The mode router is gone (2026-09-14): Today and Tasks are unmounted, and
 * what lands on bare `/` is the per-staff daily checklist
 * (`HomeDailyMode`). The spine row is "Daily" with the lucide ListChecks
 * glyph.
 *
 * `Suspense` wraps the client workspace because it reads `useSearchParams`
 * (`?date=` on the checklist); the frame is INSIDE that boundary for the
 * same reason — `DeskPageLayout` reads the params too, to resolve the page.
 *
 * The frame is the one every desk and station wears as of 2026-08-31
 * (`@/design-system/components/DeskPageChrome`): the page title top-left and,
 * with no `SIDEBAR_PAGE_NAV` children left, no tab row — the honest shape
 * for a single-surface desk.
 *
 * Since 2026-09-25 the agenda is an industrial record ledger inside an
 * industrial region — rows edge to edge, 0 radius, 1px rules (BRIEF; the
 * To-ship desk's frame). The agenda mounts its OWN `DeskPageLayout` (flush)
 * because its lens tabs (All · Daily checklist · Tasks · Tickets · Tickets in
 * tasks) are local view state with live counts, passed as the chrome's tabs
 * the way Reports passes its own.
 */
export default function Home() {
  return (
    <Suspense>
      <ModeRegion mode="industrial" className="contents">
        <HomeWorkspace />
      </ModeRegion>
    </Suspense>
  );
}
