import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { HomeWorkspace } from '@/features/home/HomeWorkspace';
import { isParkedSurfaceLive } from '@/lib/dogfood/parked-surfaces';

/**
 * Home (`/`) — the personal triage + collaboration workbench (plan §3.1). A
 * mode rail (Today | Tasks | Collab | Plan | Brief) over `?mode=` URL state;
 * `today` composes the real My Day feed, `forge` the live master-plan console.
 *
 * Still parked off the dogfood nav by default (bare `/` redirects to the
 * dashboard) — unlock with `DOGFOOD_FULL_SURFACE`. Two deep-link escape hatches
 * always reach Home even while parked: `?welcome=1` (post-signup onboarding)
 * and any `?mode=` (so `/forge` → `/?mode=forge&view=live` lands). Full un-park
 * (nav re-add, ops `plans` redirect) is the deliberate §3.4/§30 follow-up.
 *
 * `Suspense` wraps the client workspace because it reads `useSearchParams` for
 * the `?mode=` state (same mount shape as the Operations page).
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string; mode?: string }>;
}) {
  const params = await searchParams;
  const welcome = params.welcome === '1';
  const hasMode = typeof params.mode === 'string' && params.mode.length > 0;
  if (!isParkedSurfaceLive() && !welcome && !hasMode) {
    redirect('/dashboard');
  }
  return (
    <Suspense>
      <HomeWorkspace />
    </Suspense>
  );
}
